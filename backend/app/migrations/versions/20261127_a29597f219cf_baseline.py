"""baseline

Revision ID: a29597f219cf
Revises:
Create Date: 2026-11-27 13:03:33.236379

Reviewed by hand: [x] Empty baseline: the root every later migration descends from.
"""

from collections.abc import Sequence

revision: str = "a29597f219cf"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
