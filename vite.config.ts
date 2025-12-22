import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import dns from "node:dns/promises";

function parseBimiLogoUrlFromTxt(txt: string): string | null {
  if (!txt) return null;
  const parts = String(txt)
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);

  const kv = new Map<string, string>();
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq <= 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    const v = p.slice(eq + 1).trim();
    if (k) kv.set(k, v);
  }

  const version = kv.get("v");
  if (!version || version.toUpperCase() !== "BIMI1") return null;

  const l = kv.get("l");
  return l ? l.trim() : null;
}

async function fetchBimiLogoForDomain(domain: string, selector: string): Promise<string | null> {
  const hostname = `${selector}._bimi.${domain}`;
  try {
    const records = await dns.resolveTxt(hostname);
    for (const rr of records) {
      const logoUrl = parseBimiLogoUrlFromTxt(rr.join(""));
      if (logoUrl) return logoUrl;
    }
    return null;
  } catch (err: unknown) {
    // Missing DNS record / domain is not an error for the UI; treat as "no BIMI".
    const errObj = err as { code?: string };
    if (errObj?.code === "ENOTFOUND" || errObj?.code === "ENODATA") return null;
    throw err;
  }
}

function bimiDevApi() {
  return {
    name: "duckwebmail:bimi-dev-api",
    apply: "serve",
    configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
      // Dev-only BIMI endpoint. In prod, `server.mjs` serves this.
      server.middlewares.use(async (req: { url?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (body: string) => void }, next: () => void) => {
        try {
          if (!req.url) return next();
          const url = new URL(req.url, "http://localhost");
          if (url.pathname !== "/api/bimi") return next();

          const domain = url.searchParams.get("domain")?.trim() ?? "";
          const selector = (url.searchParams.get("selector")?.trim() || "default").toLowerCase();

          if (!domain) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Missing domain parameter" }));
            return;
          }

          if (
            !/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(domain)
          ) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Invalid domain format" }));
            return;
          }

          const logoUrl = await fetchBimiLogoForDomain(domain.toLowerCase(), selector);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify({ logoUrl }));
        } catch (err: unknown) {
          // Missing DNS record / domain is not an error for the UI; treat as "no BIMI".
          const errObj = err as { code?: string };
          if (errObj?.code === "ENOTFOUND" || errObj?.code === "ENODATA") {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify({ logoUrl: null }));
            return;
          }
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), bimiDevApi()],
  server: {
    proxy: {
      "/.well-known/jmap": {
        target: "https://stalwart-mail:443",
        changeOrigin: true,
        secure: false
      },
      // WebSocket proxy for JMAP push - must be before generic /jmap
      "/jmap/ws": {
        target: "wss://stalwart-mail:443",
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy) => {
          // Intercept WebSocket upgrade requests to inject Authorization header
          proxy.on("proxyReqWs", (proxyReq, req) => {
            // Extract auth from query param (e.g. ?auth=Basic%20xyz)
            const url = new URL(req.url ?? "", `http://${req.headers.host}`);
            const authParam = url.searchParams.get("auth");

            if (authParam) {
              proxyReq.setHeader("Authorization", authParam);
              // Remove auth param from forwarded URL to avoid leaking it
              url.searchParams.delete("auth");
              proxyReq.path = url.pathname + url.search;
            }
          });
        }
      },
      "/jmap": {
        target: "https://stalwart-mail:443",
        changeOrigin: true,
        secure: false
      }
    }
  }
});


