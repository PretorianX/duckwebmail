export type DeployEnvKey = "VITE_DEFAULT_THEME" | "VITE_DEFAULT_SCHEME" | "VITE_LOGIN_BRANDING" | "VITE_LOGIN_TAGLINE";

export type DeployEnv = Partial<Record<DeployEnvKey, string>>;

function fromWindow(): DeployEnv {
  const win = window as unknown as { __DUCKWEBMAIL_ENV__?: DeployEnv };
  return win.__DUCKWEBMAIL_ENV__ ?? {};
}

function fromImportMeta(): DeployEnv {
  // Vite injects these at build-time. In production we prefer runtime injection.
  return {
    VITE_DEFAULT_THEME: (import.meta as unknown as { env?: Record<string, unknown> }).env?.VITE_DEFAULT_THEME as string | undefined,
    VITE_DEFAULT_SCHEME: (import.meta as unknown as { env?: Record<string, unknown> }).env?.VITE_DEFAULT_SCHEME as string | undefined,
    VITE_LOGIN_BRANDING: (import.meta as unknown as { env?: Record<string, unknown> }).env?.VITE_LOGIN_BRANDING as string | undefined,
    VITE_LOGIN_TAGLINE: (import.meta as unknown as { env?: Record<string, unknown> }).env?.VITE_LOGIN_TAGLINE as string | undefined
  };
}

export function getDeployEnv(key: DeployEnvKey): string | undefined {
  const win = fromWindow()[key];
  if (typeof win === "string") return win;

  const built = fromImportMeta()[key];
  if (typeof built === "string") return built;

  return undefined;
}


