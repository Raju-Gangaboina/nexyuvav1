"""add_smart_scheduling_tables

Revision ID: 9a1c2e5b7d34
Revises: 81229faad0b1
Create Date: 2026-09-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9a1c2e5b7d34'
down_revision: Union[str, None] = '81229faad0b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'org_calendar_auth',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('google_email', sa.String(length=255), nullable=False),
        sa.Column('encrypted_refresh_token', sa.Text(), nullable=False),
        sa.Column('connected_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('organization_id'),
    )
    op.create_table(
        'scheduled_interviews',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('application_id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('internship_id', sa.UUID(), nullable=False),
        sa.Column('status', sa.Enum('PROPOSED', 'CONFIRMED', 'CANCELLED', name='scheduledinterviewstatus'), nullable=False),
        sa.Column('proposed_slots', sa.JSON(), nullable=False),
        sa.Column('selected_slot', sa.JSON(), nullable=True),
        sa.Column('duration_minutes', sa.Integer(), nullable=False),
        sa.Column('google_event_id', sa.String(length=255), nullable=True),
        sa.Column('meet_link', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('confirmed_at', sa.DateTime(), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['application_id'], ['applications.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.ForeignKeyConstraint(['student_id'], ['student_profiles.id'], ),
        sa.ForeignKeyConstraint(['internship_id'], ['internships.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('application_id'),
    )


def downgrade() -> None:
    op.drop_table('scheduled_interviews')
    op.execute('DROP TYPE IF EXISTS scheduledinterviewstatus')
    op.drop_table('org_calendar_auth')
