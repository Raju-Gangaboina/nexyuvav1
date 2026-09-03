"""add internship dashboard fields (responsibilities, eligibility, perks, cgpa_cutoff, sector)

Revision ID: d8a1f4b62c93
Revises: c4a9d21e7f11
Create Date: 2026-07-31 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd8a1f4b62c93'
down_revision: Union[str, None] = 'c4a9d21e7f11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # C1 audit fix: these fields existed only in the Node/JSON store, never
    # in Postgres — the FastAPI recommendation response silently dropped
    # them, blanking out half the student dashboard card UI.
    op.add_column('internships', sa.Column('responsibilities', sa.Text(), nullable=True))
    op.add_column('internships', sa.Column('eligibility', sa.Text(), nullable=True))
    op.add_column('internships', sa.Column('perks', postgresql.ARRAY(sa.String()), nullable=True))
    op.add_column('internships', sa.Column('cgpa_cutoff', sa.Float(), nullable=True))
    op.add_column(
        'internships',
        sa.Column('sector', sa.String(length=100), nullable=False, server_default='Private'),
    )


def downgrade() -> None:
    op.drop_column('internships', 'sector')
    op.drop_column('internships', 'cgpa_cutoff')
    op.drop_column('internships', 'perks')
    op.drop_column('internships', 'eligibility')
    op.drop_column('internships', 'responsibilities')
