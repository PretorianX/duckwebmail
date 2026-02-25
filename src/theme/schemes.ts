export type ThemeSchemeId = "duck" | "duck2" | "paper" | "mono" | "pure-email";

type CssVarName = `--${string}`;
type CssVars = Record<CssVarName, string>;

export const DEFAULT_THEME_SCHEME: ThemeSchemeId = "duck";

type ThemeScheme = { id: ThemeSchemeId; label: string; vars: CssVars; darkVars?: CssVars };

export const THEME_SCHEMES: Record<ThemeSchemeId, ThemeScheme> = {
  duck: {
    id: "duck",
    label: "Duck",
    vars: {
      "--accent-color": "#ffcc00",
      "--accent-rgb": "255, 204, 0",
      "--duck-yellow": "#ffde59",
      "--duck-orange": "#f7941d",
      "--duck-orange-rgb": "247, 148, 29",

      "--compose-font-family": "'Inter', 'Nunito', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--compose-font-size": "16px",
      "--compose-line-height": "1.45",
      "--compose-toolbar-bg": "rgba(255, 204, 0, 0.06)",
      "--compose-quote-bg": "rgba(255, 204, 0, 0.06)",
      "--compose-quote-border": "rgba(255, 204, 0, 0.9)"
    }
  },
  duck2: {
    id: "duck2",
    label: "Duck 2.0",
    vars: {
      "--bg-color": "#0d1b2a",
      "--surface-color": "#1b263b",
      "--text-primary": "#ccd6e0",
      "--text-secondary": "#7a8ca7",
      "--accent-color": "#f4a261",
      "--accent-rgb": "244, 162, 97",
      "--hover-color": "rgba(244,162,97,0.2)",
      "--border-color": "rgba(255,255,255,0.06)",

      "--primary-color": "var(--accent-color)",
      "--secondary-color": "var(--surface-color)",
      "--background-color": "var(--bg-color)",
      "--card-background": "var(--surface-color)",
      "--text-color": "var(--text-primary)",
      "--light-text": "var(--text-secondary)",
      "--shadow-color": "rgba(0, 0, 0, 0.55)",

      "--duck-orange": "var(--accent-color)",
      "--duck-orange-rgb": "244, 162, 97",
      "--duck-orange-light": "#f7b27d",
      "--duck-black": "var(--text-primary)",
      "--duck-gray": "var(--surface-color)",
      "--duck-white": "var(--surface-color)",
      "--duck-yellow": "#ffde59",

      "--dark-button-text": "#0d1b2a",

      "--compose-font-family": "'Noto Sans', 'Inter', 'Nunito', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--compose-font-size": "16px",
      "--compose-line-height": "1.45",
      "--compose-toolbar-bg": "rgba(244,162,97,0.10)",
      "--compose-quote-bg": "rgba(244,162,97,0.10)",
      "--compose-quote-border": "rgba(244,162,97,0.90)"
    }
  },
  "pure-email": {
    id: "pure-email",
    label: "Pure Email",
    vars: {
      "--primary-color": "#0d9488",
      "--secondary-color": "#ffffff",
      "--accent-color": "#0d9488",
      "--accent-rgb": "13, 148, 136",
      "--text-color": "#111827",
      "--light-text": "#6b7280",
      "--border-color": "#e5e7eb",
      "--background-color": "#ffffff",
      "--card-background": "#ffffff",
      "--shadow-color": "rgba(17, 24, 39, 0.08)",

      "--duck-orange": "#0d9488",
      "--duck-orange-rgb": "13, 148, 136",
      "--duck-orange-light": "#14b8a6",
      "--duck-black": "#111827",
      "--duck-gray": "#f9fafb",
      "--duck-white": "#ffffff",
      "--duck-yellow": "#ccfbf1",

      "--dark-button-text": "#ffffff",

      "--compose-font-family": "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      "--compose-font-size": "16px",
      "--compose-line-height": "1.5",
      "--compose-toolbar-bg": "rgba(13, 148, 136, 0.06)",
      "--compose-quote-bg": "rgba(13, 148, 136, 0.08)",
      "--compose-quote-border": "rgba(13, 148, 136, 0.9)"
    },
    darkVars: {
      "--primary-color": "#14b8a6",
      "--secondary-color": "#0f172a",
      "--accent-color": "#14b8a6",
      "--accent-rgb": "20, 184, 166",
      "--text-color": "#e5e7eb",
      "--light-text": "#94a3b8",
      "--border-color": "#1f2937",
      "--background-color": "#0b1220",
      "--card-background": "#0f172a",
      "--shadow-color": "rgba(0, 0, 0, 0.55)",

      "--duck-orange": "#14b8a6",
      "--duck-orange-rgb": "20, 184, 166",
      "--duck-orange-light": "#2dd4bf",
      "--duck-black": "#e5e7eb",
      "--duck-gray": "#0b1220",
      "--duck-white": "#0f172a",
      "--duck-yellow": "#134e4a",

      "--dark-button-text": "#ffffff",

      "--dark-input-bg": "#0b1220",
      "--dark-border": "#1f2937",

      "--compose-toolbar-bg": "rgba(20, 184, 166, 0.10)",
      "--compose-quote-bg": "rgba(20, 184, 166, 0.12)",
      "--compose-quote-border": "rgba(20, 184, 166, 0.95)"
    }
  },
  paper: {
    id: "paper",
    label: "Paper",
    vars: {
      "--background-color": "#f6f1e7",
      "--card-background": "#fffaf2",
      "--border-color": "rgba(0, 0, 0, 0.12)",
      "--text-color": "#1f2937",
      "--light-text": "#4b5563",
      "--primary-color": "#0f766e",
      "--accent-color": "#ffcc00",
      "--accent-rgb": "255, 204, 0",
      "--shadow-color": "rgba(0, 0, 0, 0.08)",

      "--duck-orange": "#d4940a",
      "--duck-orange-rgb": "212, 148, 10",
      "--duck-orange-light": "#e6a81c",
      "--duck-black": "#1f2937",
      "--duck-gray": "#f6f1e7",
      "--duck-white": "#fffaf2",
      "--duck-yellow": "#fff3c4",

      "--dark-button-text": "#1f2937",

      "--compose-font-family": "'Georgia', 'Times New Roman', ui-serif, serif",
      "--compose-font-size": "16px",
      "--compose-line-height": "1.55",
      "--compose-toolbar-bg": "rgba(15, 118, 110, 0.06)",
      "--compose-quote-bg": "rgba(255, 204, 0, 0.08)",
      "--compose-quote-border": "rgba(255, 204, 0, 0.95)"
    }
  },
  mono: {
    id: "mono",
    label: "Mono",
    vars: {
      "--primary-color": "#2563eb",
      "--accent-color": "#ffcc00",
      "--accent-rgb": "255, 204, 0",

      "--duck-orange": "#2563eb",
      "--duck-orange-rgb": "37, 99, 235",
      "--duck-orange-light": "#3b82f6",
      "--duck-black": "#222222",
      "--duck-gray": "#f0f0f0",
      "--duck-white": "#ffffff",
      "--duck-yellow": "#dbeafe",

      "--dark-button-text": "#ffffff",

      "--compose-font-family": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      "--compose-font-size": "15px",
      "--compose-line-height": "1.5",
      "--compose-toolbar-bg": "rgba(37, 99, 235, 0.06)",
      "--compose-quote-bg": "rgba(255, 204, 0, 0.08)",
      "--compose-quote-border": "rgba(255, 204, 0, 0.95)"
    }
  }
};

export function isThemeSchemeId(value: unknown): value is ThemeSchemeId {
  return value === "duck" || value === "duck2" || value === "paper" || value === "mono" || value === "pure-email";
}

function cssVarsToCss(vars: CssVars): string {
  return Object.entries(vars)
    .map(([k, v]) => `    ${k}: ${v};`)
    .join("\n");
}

export const schemeCss = Object.values(THEME_SCHEMES)
  .map((scheme) => {
    const base = `
  [data-scheme='${scheme.id}'] {
${cssVarsToCss(scheme.vars)}
  }`;

    const dark = scheme.darkVars
      ? `
  [data-theme='dark'][data-scheme='${scheme.id}'] {
${cssVarsToCss(scheme.darkVars)}
  }`
      : "";

    return `${base}${dark}`;
  })
  .join("\n");

