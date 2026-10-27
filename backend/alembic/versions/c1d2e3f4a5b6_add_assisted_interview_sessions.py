"""add_assisted_interview_sessions_and_turns

Revision ID: c1d2e3f4a5b6
Revises: a7b8c9d0e1f2
Create Date: 2026-09-08 00:00:00.000000

Two-table design (session + turn) — see app/core/models.py's Module 5.6
comment for why this replaced an earlier single-JSON-column draft before
it was ever applied to the real DB.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'assisted_interview_sessions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('application_id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('internship_id', sa.UUID(), nullable=False),
        sa.Column('status', sa.Enum('ACTIVE', 'ENDED', name='assistedinterviewstatus'), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['application_id'], ['applications.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.ForeignKeyConstraint(['student_id'], ['student_profiles.id'], ),
        sa.ForeignKeyConstraint(['internship_id'], ['internships.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'assisted_interview_turns',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('session_id', sa.UUID(), nullable=False),
        sa.Column('sequence', sa.Integer(), nullable=False),
        sa.Column('speaker', sa.String(length=20), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('ai_suggestions', sa.JSON(), nullable=False),
        sa.Column('accepted_suggestion_id', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['assisted_interview_sessions.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    # Every turn/suggestion lookup and the rolling-context query are scoped
    # to (session_id, sequence) — index it rather than relying on a
    # sequential scan as sessions accumulate turns.
    op.create_index(
        'ix_assisted_interview_turns_session_sequence',
        'assisted_interview_turns',
        ['session_id', 'sequence'],
    )


def downgrade() -> None:
    op.drop_index('ix_assisted_interview_turns_session_sequence', table_name='assisted_interview_turns')
    op.drop_table('assisted_interview_turns')
    op.drop_table('assisted_interview_sessions')
    op.execute('DROP TYPE IF EXISTS assistedinterviewstatus')
