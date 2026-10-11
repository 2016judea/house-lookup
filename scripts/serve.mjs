// Local dev server: static files + /api/lookup through the real handler.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import handler from "../api/lookup.js";
const root = join(import.meta.dirname, "..");
const types = { ".html": "text/html", ".json": "application/json", ".js": "text/javascript" };
createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/api/lookup") {
    const shim = { setHeader: (k, v) => res.setHeader(k, v), status(c) { res.statusCode = c; return shim; }, json(o) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); } };
    return handler({ query: Object.fromEntries(u.searchParams) }, shim);
  }
  try {
    const p = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
    const body = await readFile(join(root, p));
    res.setHeader("content-type", types[extname(p)] ?? "application/octet-stream");
    res.end(body);
  } catch { res.statusCode = 404; res.end("not found"); }
}).listen(process.env.PORT ?? 4180, () => console.log("http://localhost:" + (process.env.PORT ?? 4180)));
