"""Production workflow: work centers, step templates, job steps, activity log

Revision ID: q7b9d1f3a5c6
Revises: p6a8c0e2f4b5
Create Date: 2026-11-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'q7b9d1f3a5c6'
down_revision: Union[str, Sequence[str], None] = 'p6a8c0e2f4b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'work_centers',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(), nullable=False, unique=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('color', sa.String(), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index('ix_work_centers_id', 'work_centers', ['id'])
    op.create_table(
        'user_work_centers',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('work_center_id', sa.Integer(), sa.ForeignKey('work_centers.id', ondelete='CASCADE'), primary_key=True),
    )
    op.create_table(
        'workflow_templates',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('category_id', sa.Integer(), sa.ForeignKey('product_categories.id', ondelete='CASCADE'), nullable=True, unique=True),
    )
    op.create_index('ix_workflow_templates_id', 'workflow_templates', ['id'])
    op.create_table(
        'workflow_template_steps',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('workflow_templates.id', ondelete='CASCADE'), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False, server_default='internal'),
        sa.Column('stage', sa.String(), nullable=False, server_default='printing'),
        sa.Column('work_center_id', sa.Integer(), sa.ForeignKey('work_centers.id'), nullable=True),
    )
    op.create_index('ix_workflow_template_steps_id', 'workflow_template_steps', ['id'])
    op.create_table(
        'job_steps',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('job_card_id', sa.Integer(), sa.ForeignKey('job_cards.id', ondelete='CASCADE'), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False, server_default='internal'),
        sa.Column('stage', sa.String(), nullable=False, server_default='printing'),
        sa.Column('work_center_id', sa.Integer(), sa.ForeignKey('work_centers.id'), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='waiting'),
        sa.Column('assigned_to', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('ready_at', sa.DateTime(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.Column('started_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('completed_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('hold_reason', sa.String(), nullable=True),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('outsource_job_id', sa.Integer(), sa.ForeignKey('outsource_jobs.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_job_steps_id', 'job_steps', ['id'])
    op.create_index('ix_job_steps_job_card_id', 'job_steps', ['job_card_id'])
    op.create_index('ix_job_steps_status', 'job_steps', ['status'])
    op.create_table(
        'job_events',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('job_card_id', sa.Integer(), sa.ForeignKey('job_cards.id', ondelete='CASCADE'), nullable=False),
        sa.Column('step_id', sa.Integer(), sa.ForeignKey('job_steps.id', ondelete='SET NULL'), nullable=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('detail', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_job_events_id', 'job_events', ['id'])
    op.create_index('ix_job_events_job_card_id', 'job_events', ['job_card_id'])
    op.create_index('ix_job_events_created_at', 'job_events', ['created_at'])
    op.add_column('job_cards', sa.Column('delivered_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('job_cards', 'delivered_at')
    op.drop_table('job_events')
    op.drop_table('job_steps')
    op.drop_table('workflow_template_steps')
    op.drop_table('workflow_templates')
    op.drop_table('user_work_centers')
    op.drop_table('work_centers')
