"""Template unit tests (service with a fake repository). Rename along with the module.

After copying, the module directory is no longer excluded, so these run automatically.
"""

import pytest

from app.core.errors import ConflictError, NotFoundError
from app.core.pagination import PageParams
from app.modules._template.models import Example
from app.modules._template.schemas import ExampleCreate, ExampleUpdate
from app.modules._template.service import ExampleService


class FakeExampleRepository:
    def __init__(self) -> None:
        self.rows: dict[str, Example] = {}

    def get(self, example_id: str) -> Example | None:
        return self.rows.get(example_id)

    def list(self, *, limit: int, offset: int) -> tuple[list[Example], int]:
        rows = list(self.rows.values())
        return rows[offset : offset + limit], len(rows)

    def add(self, example: Example) -> Example:
        from datetime import UTC, datetime

        from app.core.db import new_id

        example.id = new_id()
        example.status = "active"
        example.version = 1
        example.created_at = example.updated_at = datetime.now(UTC)
        self.rows[example.id] = example
        return example

    def delete(self, example: Example) -> None:
        del self.rows[example.id]


@pytest.fixture
def service() -> ExampleService:
    return ExampleService(FakeExampleRepository())


def test_create_example_returns_read_model_when_valid(service: ExampleService) -> None:
    created = service.create_example(ExampleCreate(name="first"))
    assert created.name == "first"
    assert service.list_examples(PageParams()).total == 1


def test_get_example_raises_not_found_when_missing(service: ExampleService) -> None:
    with pytest.raises(NotFoundError):
        service.get_example("missing")


def test_update_example_raises_conflict_when_version_stale(service: ExampleService) -> None:
    created = service.create_example(ExampleCreate(name="first"))
    with pytest.raises(ConflictError):
        service.update_example(created.id, ExampleUpdate(name="x", version=99))
