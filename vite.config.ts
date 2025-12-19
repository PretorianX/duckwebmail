import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
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


