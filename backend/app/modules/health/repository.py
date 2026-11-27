from sqlalchemy import select
from sqlalchemy.orm import Session


class HealthRepository:
    """All DB access for the health module."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def ping(self) -> None:
        """Run a trivial query; raises if the database is unreachable."""
        self._session.execute(select(1)).scalar_one()
