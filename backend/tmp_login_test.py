import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

url = 'http://127.0.0.1:8000/api/v1/auth/login'
data = json.dumps({'email': 'admin@srijayam.com', 'password': 'Admin@123'}).encode('utf-8')
req = Request(url, data=data, headers={'Content-Type': 'application/json'}, method='POST')
try:
    with urlopen(req) as resp:
        print(resp.status)
        print(resp.read().decode())
except HTTPError as e:
    print(e.code)
    print(e.read().decode())
