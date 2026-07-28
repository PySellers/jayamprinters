import json
from urllib import request

url = 'http://127.0.0.1:8000/api/v1/auth/login'
data = json.dumps({'email': 'admin@srijayam.com', 'password': 'Admin@123'}).encode('utf-8')
req = request.Request(url, data=data, headers={'Content-Type': 'application/json'})
try:
    with request.urlopen(req) as resp:
        print(resp.status)
        print(resp.read().decode())
except Exception as exc:
    if hasattr(exc, 'code'):
        print('status', exc.code)
    print(exc.read().decode() if hasattr(exc, 'read') else exc)
