from pathlib import Path

path = Path('requirements.txt')
text = path.read_text(encoding='utf-16')
line = 'email-validator==2.3.0'
lines = text.splitlines()
if line not in lines:
    if text.endswith('\n') or text.endswith('\r'):
        new_text = text.rstrip('\r\n') + '\n' + line + '\n'
    else:
        new_text = text + '\n' + line + '\n'
    path.write_text(new_text, encoding='utf-8')
    print('converted-to-utf8 and added email-validator')
else:
    path.write_text(text, encoding='utf-8')
    print('converted-to-utf8 and verified email-validator present')
