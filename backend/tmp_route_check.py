from app.main import app
import json

paths = []
for route in app.routes:
    if hasattr(route, 'path'):
        paths.append(route.path)
    else:
        paths.append(repr(route))

print(json.dumps(paths, indent=2))
