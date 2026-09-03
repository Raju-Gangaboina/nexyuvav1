"""add organization verification workflow fields

Revision ID: b3f1c9a02d47
Revises: 02fdfa2a9075
Create Date: 2026-07-31 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import pgvector


# revision identifiers, used by Alembic.
revision: str = 'b3f1c9a02d47'
down_revision: Union[str, None] = '02fdfa2a9075'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    org_verification_status = sa.Enum(
        'UNSUBMITTED', 'PENDING', 'APPROVED', 'REJECTED',
        name='orgverificationstatus',
    )
    org_verification_status.create(op.get_bind(), checkfirst=True)

    op.add_column(
        'organizations',
        sa.Column(
            'verification_status', org_verification_status,
            nullable=False, server_default='UNSUBMITTED',
        ),
    )
    op.add_column('organizations', sa.Column('verification_doc_path', sa.String(length=500), nullable=True))
    op.add_column('organizations', sa.Column('verification_doc_name', sa.String(length=255), nullable=True))
    op.add_column('organizations', sa.Column('verification_submitted_at', sa.DateTime(), nullable=True))
    op.add_column('organizations', sa.Column('verification_reviewed_at', sa.DateTime(), nullable=True))
    op.add_column('organizations', sa.Column('rejection_reason', sa.Text(), nullable=True))

    # Backfill: any org already marked is_verified (e.g. from the earlier
    # dev-mode auto-verify shortcut) should read as APPROVED, not
    # UNSUBMITTED, so existing test accounts don't regress.
    op.execute("UPDATE organizations SET verification_status = 'APPROVED' WHERE is_verified = true")


def downgrade() -> None:
    op.drop_column('organizations', 'rejection_reason')
    op.drop_column('organizations', 'verification_reviewed_at')
    op.drop_column('organizations', 'verification_submitted_at')
    op.drop_column('organizations', 'verification_doc_name')
    op.drop_column('organizations', 'verification_doc_path')
    op.drop_column('organizations', 'verification_status')
    sa.Enum(name='orgverificationstatus').drop(op.get_bind(), checkfirst=True)
