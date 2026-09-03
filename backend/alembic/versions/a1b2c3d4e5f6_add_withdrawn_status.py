"""add withdrawn status to applications

Revision ID: a1b2c3d4e5f6
Revises: 33929c592dea
Create Date: 2026-08-01 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '33929c592dea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres enum value additions need an explicit ALTER TYPE — same
    # pattern as 5cbe2b8098b7's COMPLETED addition.
    op.execute("ALTER TYPE applicationstatus ADD VALUE IF NOT EXISTS 'WITHDRAWN'")


def downgrade() -> None:
    # Postgres has no native DROP VALUE for enums, so 'WITHDRAWN' cannot be
    # cleanly removed from applicationstatus on downgrade.
    pass
