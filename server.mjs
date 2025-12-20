import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT ?? "8002");
const DIST_DIR = path.join(__dirname, "dist");
const INDEX_PATH = path.join(DIST_DIR, "index.html");

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"]
]);

function setCommonHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function isWithinDir(filePath, dirPath) {
  const rel = path.relative(dirPath, filePath);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

const server = http.createServer(async (req, res) => {
  try {
    setCommonHeaders(res);

    if (!req.url) {
      res.statusCode = 400;
      res.end("Bad Request");
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const candidatePath = path.join(DIST_DIR, pathname);

    // Prevent path traversal.
    if (!isWithinDir(candidatePath, DIST_DIR)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }

    // Serve file if it exists and is a file, otherwise SPA fallback to index.html.
    let targetPath = INDEX_PATH;
    try {
      const st = await stat(candidatePath);
      if (st.isFile()) {
        targetPath = candidatePath;
      }
    } catch {
      // ignore, fallback to index
    }

    const ext = path.extname(targetPath).toLowerCase();
    res.setHeader("Content-Type", CONTENT_TYPES.get(ext) ?? "application/octet-stream");

    // Cache hashed assets aggressively; keep HTML un-cached.
    if (targetPath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (ext === ".html") {
      res.setHeader("Cache-Control", "no-cache");
    }

    const body = await readFile(targetPath);
    res.statusCode = 200;
    res.end(body);
  } catch {
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(PORT, "0.0.0.0");


