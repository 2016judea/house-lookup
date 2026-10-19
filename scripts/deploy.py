#!/usr/bin/env python3
"""Deploy this repo to Vercel over the REST API (no CLI). Needs VERCEL_TOKEN."""
import hashlib, json, os, sys, urllib.request
TEAM = "team_XnhPzBEcaSfEmZFo9M2isLFY"
PROJECT = "house-lookup"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHIP = ["index.html", "example.json", "vercel.json", "package.json", "api/lookup.js", "lib/lookup.js"]
# Only public/ is static. Until 2026-10-19 outputDirectory "." served api/lookup.js and
# lib/lookup.js as plain text (curl, 200). The page and its example go up under public/;
# the function, lib/ and package.json stay at the root.
STATIC = {"index.html", "example.json"}
TOKEN = os.environ["VERCEL_TOKEN"]

def call(method, path, body=None, headers=None, raw=None):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    h = {"Authorization": f"Bearer {TOKEN}", **({"Content-Type": "application/json"} if raw is None else {}), **(headers or {})}
    req = urllib.request.Request(f"https://api.vercel.com{path}", data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return json.loads(e.read() or b"{}")

files = []
for rel in SHIP:
    b = open(os.path.join(ROOT, rel), "rb").read()
    sha = hashlib.sha1(b).hexdigest()
    call("POST", f"/v2/files?teamId={TEAM}", raw=b, headers={"x-vercel-digest": sha, "Content-Type": "application/octet-stream"})
    files.append({"file": ("public/" + rel) if rel in STATIC else rel, "sha": sha, "size": len(b)})
d = call("POST", f"/v13/deployments?teamId={TEAM}&forceNew=1", {
    "name": PROJECT, "project": PROJECT, "target": "production", "files": files,
    "projectSettings": {"framework": None, "buildCommand": "echo build", "outputDirectory": "public", "installCommand": "echo skip"},
})
print(d.get("id"), d.get("readyState"), d.get("url"), d.get("error"))
