import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dns from "node:dns/promises";

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

async function fetchBimiRecord(domain, selector = "default") {
  // Per BIMI spec: <selector>._bimi.<domain>
  const hostname = `${selector}._bimi.${domain}`;
  try {
    const records = await dns.resolveTxt(hostname);
    if (records.length === 0) return null;

    // BIMI record format: v=BIMI1; l=<logo-url>; a=<authority-url>
    // Real-world TXT records may:
    // - be split across multiple TXT chunks
    // - have multiple TXT records
    // - have parameters in any order
    for (const rr of records) {
      const record = rr.join("");
      const logoUrl = parseBimiLogoUrlFromTxt(record);
      if (logoUrl) return logoUrl;
    }
    return null;
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
      return null;
    }
    throw err;
  }
}

export function parseBimiLogoUrlFromTxt(txt) {
  if (!txt) return null;
  const parts = String(txt)
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);

  const kv = new Map();
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    const v = p.slice(eq + 1).trim();
    if (k) kv.set(k, v);
  }

  const version = kv.get("v");
  if (!version || String(version).toUpperCase() !== "BIMI1") return null;

  const l = kv.get("l");
  if (!l) return null;
  return String(l).trim() || null;
}

async function handleBimiRequest(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const domain = url.searchParams.get("domain");
    const selector = url.searchParams.get("selector") || "default";
    
    if (!domain) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing domain parameter" }));
      return;
    }
    
    // Validate domain format
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(domain)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid domain format" }));
      return;
    }
    
    // Try default selector first
    let logoUrl = await fetchBimiRecord(domain, selector);
    
    // If default selector fails, try alternative selector formats
    if (!logoUrl && selector === "default") {
      // Try _bimi_84l7e_817 format (selector: 84l7e)
      logoUrl = await fetchBimiRecord(domain, "84l7e");
      
      // If that fails, try querying _bimi_84l7e_817.<domain> directly
      if (!logoUrl) {
        try {
          const hostname = `_bimi_84l7e_817.${domain}`;
          const records = await dns.resolveTxt(hostname);
          if (records.length > 0) {
            const record = records[0].join("");
            const match = record.match(/v=BIMI1[^;]*;?\s*l=([^;]+)/i);
            if (match && match[1]) {
              logoUrl = match[1].trim();
            }
          }
        } catch (err) {
          // Ignore DNS errors for alternative format
        }
      }
    }
    
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(JSON.stringify({ logoUrl }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: err.message }));
  }
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
    
    // Handle BIMI API endpoint
    if (url.pathname === "/api/bimi") {
      await handleBimiRequest(req, res);
      return;
    }
    
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

function isMainModule() {
  try {
    if (!process.argv[1]) return false;
    return pathToFileURL(process.argv[1]).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  server.listen(PORT, "0.0.0.0");
}


