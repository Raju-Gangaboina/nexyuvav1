"""add preferred_skills/required_degree/graduation_year range/keywords to internships

Revision ID: c3d4e5f6a7b8
Revises: f2a3b4c5d6e7
Create Date: 2026-08-03 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Module 1 gap-closure: the AI Campus Sourcing Agent spec lists Preferred
    # Skills, Degree, Graduation Year, and Keywords as internship attributes
    # the discovery agent should analyze -- none of them had a column to
    # live in. All nullable/empty-default so every existing posting keeps
    # working unchanged.
    op.add_column('internships', sa.Column('preferred_skills', postgresql.ARRAY(sa.String()), nullable=True))
    op.add_column('internships', sa.Column('required_degree', sa.String(length=255), nullable=True))
    op.add_column('internships', sa.Column('min_graduation_year', sa.Integer(), nullable=True))
    op.add_column('internships', sa.Column('max_graduation_year', sa.Integer(), nullable=True))
    op.add_column('internships', sa.Column('keywords', postgresql.ARRAY(sa.String()), nullable=True))


def downgrade() -> None:
    op.drop_column('internships', 'keywords')
    op.drop_column('internships', 'max_graduation_year')
    op.drop_column('internships', 'min_graduation_year')
    op.drop_column('internships', 'required_degree')
    op.drop_column('internships', 'preferred_skills')
