"""add student profile extras and org webhook fields

Revision ID: c4a9d21e7f11
Revises: b3f1c9a02d47
Create Date: 2026-07-31 13:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c4a9d21e7f11'
down_revision: Union[str, None] = 'b3f1c9a02d47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Student profile: fields that previously lived only in browser
    # localStorage (lib/userContext.ts) and are now persisted server-side.
    op.add_column('student_profiles', sa.Column('bio', sa.Text(), nullable=True))
    op.add_column('student_profiles', sa.Column('college', sa.String(length=255), nullable=True))
    op.add_column('student_profiles', sa.Column('tools', postgresql.ARRAY(sa.String()), nullable=True))
    op.add_column('student_profiles', sa.Column('preferred_domains', postgresql.ARRAY(sa.String()), nullable=True))
    op.add_column('student_profiles', sa.Column('preferred_locations', postgresql.ARRAY(sa.String()), nullable=True))
    op.add_column('student_profiles', sa.Column('preferred_mode', sa.String(length=50), nullable=True))
    op.add_column('student_profiles', sa.Column('min_stipend', sa.Integer(), nullable=True))

    # Organization: ATS webhook settings (Company > Integrations page),
    # previously only ever saved to browser localStorage.
    op.add_column('organizations', sa.Column('webhook_url', sa.String(length=500), nullable=True))
    op.add_column('organizations', sa.Column('webhook_ats', sa.String(length=100), nullable=True))
    op.add_column(
        'organizations',
        sa.Column('webhook_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('organizations', 'webhook_enabled')
    op.drop_column('organizations', 'webhook_ats')
    op.drop_column('organizations', 'webhook_url')

    op.drop_column('student_profiles', 'min_stipend')
    op.drop_column('student_profiles', 'preferred_mode')
    op.drop_column('student_profiles', 'preferred_locations')
    op.drop_column('student_profiles', 'preferred_domains')
    op.drop_column('student_profiles', 'tools')
    op.drop_column('student_profiles', 'college')
    op.drop_column('student_profiles', 'bio')
