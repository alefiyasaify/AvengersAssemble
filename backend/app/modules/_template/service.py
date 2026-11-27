"""Business rules: the module's public interface. Other modules may import ONLY this file."""

from typing import Protocol

from app.core.errors import ConflictError, NotFoundError
from app.core.pagination import Page, PageParams
from app.modules._template.models import Example
from app.modules._template.schemas import ExampleCreate, ExampleRead, ExampleUpdate


class ExampleStore(Protocol):
    """What the service needs from persistence (lets unit tests use a fake)."""

    def get(self, example_id: str) -> Example | None: ...
    def list(self, *, limit: int, offset: int) -> tuple[list[Example], int]: ...
    def add(self, example: Example) -> Example: ...
    def delete(self, example: Example) -> None: ...


class ExampleService:
    def __init__(self, repository: ExampleStore) -> None:
        self._repository = repository

    def list_examples(self, page: PageParams) -> Page[ExampleRead]:
        """Paginated list, newest first."""
        rows, total = self._repository.list(limit=page.limit, offset=page.offset)
        return Page[ExampleRead].of([ExampleRead.model_validate(r) for r in rows], total, page)

    def get_example(self, example_id: str) -> ExampleRead:
        """Raises NotFoundError if absent."""
        return ExampleRead.model_validate(self._require(example_id))

    def create_example(self, data: ExampleCreate) -> ExampleRead:
        example = self._repository.add(Example(name=data.name))
        return ExampleRead.model_validate(example)

    def update_example(self, example_id: str, data: ExampleUpdate) -> ExampleRead:
        """Partial update with optimistic locking. Raises NotFoundError / ConflictError."""
        example = self._require(example_id)
        if example.version != data.version:
            raise ConflictError(
                "The example was modified by someone else.", code="EXAMPLE_VERSION_CONFLICT"
            )
        changes = data.model_dump(exclude_unset=True, exclude={"version"})
        for field, value in changes.items():
            setattr(example, field, value)
        example.version += 1
        return ExampleRead.model_validate(example)

    def delete_example(self, example_id: str) -> None:
        """Idempotent from the client's view: deleting a missing example raises NotFoundError."""
        self._repository.delete(self._require(example_id))

    def _require(self, example_id: str) -> Example:
        example = self._repository.get(example_id)
        if example is None:
            raise NotFoundError(f"Example {example_id} was not found.", code="EXAMPLE_NOT_FOUND")
        return example
