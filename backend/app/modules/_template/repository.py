"""All DB access for this module. No HTTP types. SQLAlchemy constructs only (Postgres-ready)."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules._template.models import Example


class ExampleRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, example_id: str) -> Example | None:
        return self._session.get(Example, example_id)

    def list(self, *, limit: int, offset: int) -> tuple[list[Example], int]:
        total = self._session.execute(select(func.count()).select_from(Example)).scalar_one()
        rows = (
            self._session.execute(
                select(Example)
                .order_by(Example.created_at.desc(), Example.id)
                .limit(limit)
                .offset(offset)
            )
            .scalars()
            .all()
        )
        return list(rows), total

    def add(self, example: Example) -> Example:
        self._session.add(example)
        self._session.flush()
        return example

    def delete(self, example: Example) -> None:
        self._session.delete(example)
        self._session.flush()
