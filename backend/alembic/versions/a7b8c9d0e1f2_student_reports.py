"""student_reports

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-09-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DROP TYPE IF EXISTS reporttargettype")
    op.execute("DROP TYPE IF EXISTS reportreason")
    op.execute("DROP TYPE IF EXISTS reportstatus")

    report_target_type = sa.Enum('INTERNSHIP', 'ORGANIZATION', name='reporttargettype')
    report_reason = sa.Enum(
        'FAKE_LISTING', 'UNPAID_OR_UNDERPAID', 'MISLEADING_DESCRIPTION',
        'SUSPICIOUS_COMPANY', 'HARASSMENT', 'SCAM_OR_FRAUD', 'OTHER',
        name='reportreason',
    )
    report_status = sa.Enum('OPEN', 'INVESTIGATING', 'DISMISSED', 'ACTION_TAKEN', name='reportstatus')

    op.create_table(
        'reports',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('reporter_id', sa.UUID(), nullable=False),
        sa.Column('target_type', report_target_type, nullable=False),
        sa.Column('target_id', sa.UUID(), nullable=False),
        sa.Column('reason', report_reason, nullable=False),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('evidence_path', sa.String(length=500), nullable=True),
        sa.Column('status', report_status, nullable=False, server_default='OPEN'),
        sa.Column('resolution_notes', sa.Text(), nullable=True),
        sa.Column('resolved_by', sa.UUID(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['reporter_id'], ['users.id']),
        sa.ForeignKeyConstraint(['resolved_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('reports')
    sa.Enum(name='reportstatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='reportreason').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='reporttargettype').drop(op.get_bind(), checkfirst=True)
