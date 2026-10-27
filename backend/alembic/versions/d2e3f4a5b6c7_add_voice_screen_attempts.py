"""add_voice_screen_attempts

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-09-08 00:00:00.000000

Module 5.7 — Voice Screen. Single JSON-column design (mirrors
InterviewAttempt), not the two-table design used for 5.6 — see
app/core/models.py's Module 5.7 comment for why.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = '2f76cc01a19f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'voice_screen_attempts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('application_id', sa.UUID(), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('internship_id', sa.UUID(), nullable=False),
        sa.Column('status', sa.Enum('IN_PROGRESS', 'COMPLETED', name='voicescreenstatus'), nullable=False),
        sa.Column('questions', sa.JSON(), nullable=False),
        sa.Column('final_score', sa.Float(), nullable=True),
        sa.Column('passed', sa.Boolean(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['application_id'], ['applications.id'], ),
        sa.ForeignKeyConstraint(['student_id'], ['student_profiles.id'], ),
        sa.ForeignKeyConstraint(['internship_id'], ['internships.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('voice_screen_attempts')
    op.execute('DROP TYPE IF EXISTS voicescreenstatus')
