"""internship_moderation

Revision ID: f1a2b3c4d5e6
Revises: a0d13ab3f703
Create Date: 2026-09-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'a0d13ab3f703'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    moderation_status = sa.Enum('UNREVIEWED', 'APPROVED', 'FLAGGED', 'REMOVED', name='moderationstatus')
    moderation_status.create(op.get_bind(), checkfirst=True)

    op.add_column('internships', sa.Column('moderation_status', moderation_status, nullable=False, server_default='UNREVIEWED'))
    op.add_column('internships', sa.Column('moderation_notes', sa.Text(), nullable=True))
    op.add_column('internships', sa.Column('moderated_by', sa.UUID(), nullable=True))
    op.add_column('internships', sa.Column('moderated_at', sa.DateTime(), nullable=True))
    op.create_foreign_key('fk_internships_moderated_by_users', 'internships', 'users', ['moderated_by'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_internships_moderated_by_users', 'internships', type_='foreignkey')
    op.drop_column('internships', 'moderated_at')
    op.drop_column('internships', 'moderated_by')
    op.drop_column('internships', 'moderation_notes')
    op.drop_column('internships', 'moderation_status')
    sa.Enum(name='moderationstatus').drop(op.get_bind(), checkfirst=True)
