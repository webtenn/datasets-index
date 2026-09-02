"""
Builds payload.json for the GitHub Contents API PUT request that commits
datasets-index.json back to the repo. Kept as a standalone script (rather
than inlined in the workflow YAML) so indentation can't corrupt the YAML
block scalar.

Reads TIMESTAMP (required) and SHA (optional, blank if creating a new file)
from the environment.
"""
import base64
import json
import os

with open("datasets-index.json", "rb") as f:
    content = base64.b64encode(f.read()).decode()

payload = {
    "message": f"chore: update datasets index [{os.environ['TIMESTAMP']}]",
    "content": content,
}

sha = os.environ.get("SHA", "")
if sha:
    payload["sha"] = sha

with open("payload.json", "w") as f:
    json.dump(payload, f)
