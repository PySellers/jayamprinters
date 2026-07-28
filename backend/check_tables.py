from sqlalchemy import create_engine, inspect
from configparser import ConfigParser

cfg = ConfigParser()
cfg.read('alembic.ini')
url = cfg.get('alembic', 'sqlalchemy.url')
print('DB URL:', url)
engine = create_engine(url)
inspector = inspect(engine)
print('Tables:')
for t in inspector.get_table_names():
    print(' -', t)
