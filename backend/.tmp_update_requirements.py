from pathlib import Path

path = Path('requirements.txt')
text = path.read_text(encoding='utf-8')
line = 'email-validator==2.3.0'
lines = text.splitlines()
if line not in lines:
    new_text = text.rstrip('\n') + '\n' + line + '\n'
    path.write_text(new_text, encoding='utf-8')
    print('added')
else:
    print('exists')
