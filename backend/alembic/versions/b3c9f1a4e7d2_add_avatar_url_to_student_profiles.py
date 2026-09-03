"""add_avatar_url_to_student_profiles

Revision ID: b3c9f1a4e7d2
Revises: 9a1c2e5b7d34
Create Date: 2026-09-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3c9f1a4e7d2'
down_revision: Union[str, None] = '9a1c2e5b7d34'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'student_profiles',
        sa.Column('avatar_url', sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('student_profiles', 'avatar_url')