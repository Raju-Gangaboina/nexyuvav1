"""add internship history to student_profiles

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-03 20:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Structured internship/work-experience entries (title/description)
    # parsed from a resume at upload time (see
    # app/ai/resume_parser.py's extract_experience) -- same gap projects
    # had before its migration: parsed correctly, returned once in the
    # upload response, then discarded, so it was invisible to Skill
    # Confidence scoring (Module 4) as an evidence signal. Nullable/
    # empty-default so every existing profile keeps working unchanged
    # with this unset until their next resume upload.
    op.add_column(
        'student_profiles',
        sa.Column('internship_history', postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('student_profiles', 'internship_history')
