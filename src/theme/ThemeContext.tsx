/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { DEFAULT_THEME_SCHEME, isThemeSchemeId, type ThemeSchemeId } from "./schemes";

type Theme = "light" | "dark";
type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  scheme: ThemeSchemeId;
  setScheme: (scheme: ThemeSchemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

const MOBILE_MEDIA_QUERY = "(max-width: 880px)";

const STORAGE_THEME = "theme";
const STORAGE_SCHEME = "duckwebmail:themeScheme";

function envDefaultTheme(): Theme | "system" | null {
  const raw = import.meta.env.VITE_DEFAULT_THEME as unknown;
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return null;
}

function envDefaultScheme(): ThemeSchemeId | null {
  const raw = import.meta.env.VITE_DEFAULT_SCHEME as unknown;
  return isThemeSchemeId(raw) ? raw : null;
}

function getSystemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_THEME);
  if (saved === "dark" || saved === "light") return saved;
  const env = envDefaultTheme();
  if (env === "dark" || env === "light") return env;
  if (env === "system") return getSystemTheme();
  return getSystemTheme();
}

function getInitialScheme(): ThemeSchemeId {
  const env = envDefaultScheme() ?? DEFAULT_THEME_SCHEME;
  const saved = localStorage.getItem(STORAGE_SCHEME);

  // If the scheme was previously auto-persisted as the default ("duck"),
  // allow deployments to override it via VITE_DEFAULT_SCHEME.
  // This keeps "docker compose defaults" effective without making users clear storage.
  if (saved === DEFAULT_THEME_SCHEME && env !== DEFAULT_THEME_SCHEME) return env;

  if (isThemeSchemeId(saved)) return saved;
  return env;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [manualTheme, setManualTheme] = useState<Theme>(() => getInitialTheme());
  const [systemTheme, setSystemTheme] = useState<Theme>(() => getSystemTheme());
  const [isMobile, setIsMobile] = useState<boolean>(() => window.matchMedia?.(MOBILE_MEDIA_QUERY).matches ?? false);
  const [scheme, _setScheme] = useState<ThemeSchemeId>(() => getInitialScheme());

  // Do not auto-write defaults into localStorage.
  // We only persist when the user explicitly changes theme/scheme (later: Settings UI).
  const shouldPersistThemeRef = useRef(localStorage.getItem(STORAGE_THEME) !== null);
  const shouldPersistSchemeRef = useRef(localStorage.getItem(STORAGE_SCHEME) !== null);

  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE_MEDIA_QUERY);
    if (!mq) return;
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => setSystemTheme(mq.matches ? "dark" : "light");
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme: Theme = isMobile ? systemTheme : manualTheme;

  const toggleTheme = useCallback(() => {
    // Mobile follows the device theme; manual switching is desktop-only.
    if (isMobile) return;
    shouldPersistThemeRef.current = true;
    setManualTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, [isMobile]);

  const setScheme = useCallback((next: ThemeSchemeId) => {
    shouldPersistSchemeRef.current = true;
    _setScheme(next);
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.body.dataset.scheme = scheme;
  }, [scheme]);

  useEffect(() => {
    if (!shouldPersistThemeRef.current) return;
    localStorage.setItem(STORAGE_THEME, manualTheme);
  }, [manualTheme]);

  useEffect(() => {
    if (!shouldPersistSchemeRef.current) return;
    localStorage.setItem(STORAGE_SCHEME, scheme);
  }, [scheme]);

  const value = useMemo(() => ({ theme, toggleTheme, scheme, setScheme }), [theme, toggleTheme, scheme, setScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}


