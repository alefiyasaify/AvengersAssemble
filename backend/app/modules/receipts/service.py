"""Public interface of the receipts module: validated upload behind a storage interface.

Files live under random keys (never user-controlled paths); the SHA-256 is recorded for
duplicate detection. Serving happens through the claims module, which checks visibility.
"""

import hashlib
import re
import secrets
from collections.abc import Collection
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Protocol

from sqlalchemy.orm import Session

from app.core.auth import Principal
from app.core.config import Settings
from app.core.errors import NotFoundError, PayloadTooLargeError, ValidationFailed
from app.modules.audit.service import AuditService
from app.modules.receipts.models import Receipt
from app.modules.receipts.repository import ReceiptRepository
from app.modules.receipts.schemas import ReceiptRead

# The type is decided by the file's magic bytes, never by the client's claim.
_SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"%PDF-", "application/pdf"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
)
_SAFE_NAME = re.compile(r"[^A-Za-z0-9._ -]+")

# Receipts are shown inline (side-by-side viewer) but can never run script or be re-sniffed.
SAFE_FILE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    "Cache-Control": "private, max-age=300",
}


class ReceiptStorage(Protocol):
    """Storage interface (ARD 3): local disk now, S3 later."""

    def save(self, key: str, data: bytes) -> None: ...
    def path(self, key: str) -> Path: ...


class LocalReceiptStorage:
    def __init__(self, root: str) -> None:
        self._root = Path(root)

    def path(self, key: str) -> Path:
        return self._root / key[:2] / key

    def save(self, key: str, data: bytes) -> None:
        target = self.path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(target)


@dataclass(frozen=True)
class StoredReceipt:
    id: str
    owner_id: str
    sha256: str
    mime: str
    original_name: str
    path: Path


def sniff_mime(data: bytes) -> str | None:
    for signature, mime in _SIGNATURES:
        if data.startswith(signature):
            return mime
    return None


class ReceiptService:
    def __init__(
        self,
        repository: ReceiptRepository,
        audit: AuditService,
        settings: Settings,
        storage: ReceiptStorage | None = None,
    ) -> None:
        self._repo = repository
        self._audit = audit
        self._storage = storage or LocalReceiptStorage(settings.receipts_dir)
        self._max_bytes = settings.max_receipt_bytes

    def upload(self, principal: Principal, filename: str, stream: BinaryIO) -> ReceiptRead:
        """Reads at most max_bytes + 1, so an oversized upload never fully loads into memory."""
        data = stream.read(self._max_bytes + 1)
        if len(data) > self._max_bytes:
            raise PayloadTooLargeError(
                f"Receipts are limited to {self._max_bytes // (1024 * 1024)} MB."
            )
        mime = sniff_mime(data)
        if mime is None:
            raise ValidationFailed("Receipts must be PDF, JPEG or PNG files.", code="RECEIPT_TYPE")
        sha256 = hashlib.sha256(data).hexdigest()
        key = secrets.token_hex(16)
        self._storage.save(key, data)
        name = _SAFE_NAME.sub("_", Path(filename or "receipt").name)[:255] or "receipt"
        receipt = self._repo.add(
            Receipt(
                owner_id=principal.id,
                storage_key=key,
                sha256=sha256,
                mime=mime,
                size_bytes=len(data),
                original_name=name,
            )
        )
        self._audit.record(
            actor_id=principal.id,
            action="receipt.uploaded",
            entity_type="receipt",
            entity_id=receipt.id,
            after={"sha256": sha256, "size_bytes": len(data), "mime": mime},
        )
        return ReceiptRead.model_validate(receipt)

    def info(self, ids: Collection[str]) -> dict[str, StoredReceipt]:
        return {
            rid: StoredReceipt(
                r.id, r.owner_id, r.sha256, r.mime, r.original_name, self._storage.path(r.storage_key)
            )
            for rid, r in self._repo.by_ids(ids).items()
        }

    def stored(self, receipt_id: str) -> StoredReceipt:
        found = self.info({receipt_id}).get(receipt_id)
        if found is None or not found.path.exists():
            raise NotFoundError("Receipt was not found.", code="RECEIPT_NOT_FOUND")
        return found


def receipt_service(session: Session, audit: AuditService, settings: Settings) -> ReceiptService:
    return ReceiptService(ReceiptRepository(session), audit, settings)
