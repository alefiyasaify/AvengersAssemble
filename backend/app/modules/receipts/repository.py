from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.receipts.models import Receipt


class ReceiptRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def by_ids(self, ids: Collection[str]) -> dict[str, Receipt]:
        if not ids:
            return {}
        rows = self._session.execute(select(Receipt).where(Receipt.id.in_(ids))).scalars()
        return {r.id: r for r in rows}

    def add(self, receipt: Receipt) -> Receipt:
        self._session.add(receipt)
        self._session.flush()
        return receipt
