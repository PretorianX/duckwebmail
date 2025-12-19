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
      "/jmap": {
        target: "https://stalwart-mail:443",
        changeOrigin: true,
        secure: false
      }
    }
  }
});


