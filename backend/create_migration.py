from alembic.config import Config
from alembic import command

cfg = Config('alembic.ini')
msg = 'Add quotation and quotation_items tables'
print('Running alembic revision autogenerate...')
command.revision(cfg, message=msg, autogenerate=True)
print('Done')
