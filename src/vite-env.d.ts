/// <reference types="vite/client" />

declare global {
  // Runtime deployment configuration injected by `server.mjs` into `index.html`.
  // Used in production where `VITE_*` env is not available at runtime for a prebuilt SPA.
  interface Window {
    __DUCKWEBMAIL_ENV__?: Partial<Record<"VITE_DEFAULT_THEME" | "VITE_DEFAULT_SCHEME" | "VITE_LOGIN_BRANDING" | "VITE_LOGIN_TAGLINE", string>>;
  }
}

export {};


