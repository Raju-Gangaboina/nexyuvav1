"""add projects to student_profiles

Revision ID: f2a3b4c5d6e7
Revises: b7c8d9e0f1a2
Create Date: 2026-08-03 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Structured project entries (title/tech_stack/description) parsed from
    # a resume at upload time -- previously computed correctly but returned
    # to the browser only once and never persisted, so nothing running
    # later (e.g. Sourcing Agent skill-confidence scoring) could use it.
    op.add_column(
        'student_profiles',
        sa.Column('projects', postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('student_profiles', 'projects')
