/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { DEFAULT_THEME_SCHEME, isThemeSchemeId, type ThemeSchemeId } from "./schemes";
import { getDeployEnv } from "../config/deployEnv";

type Theme = "light" | "dark";
type ThemePreference = Theme | "system";
type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
  scheme: ThemeSchemeId;
  setScheme: (scheme: ThemeSchemeId) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// Namespaced key to avoid collisions with other apps (many sites use plain "theme").
const STORAGE_THEME = "duckwebmail:theme";
const STORAGE_SCHEME = "duckwebmail:themeScheme";

function envDefaultTheme(): Theme | "system" | null {
  const raw = getDeployEnv("VITE_DEFAULT_THEME") as unknown;
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return null;
}

function envDefaultScheme(): ThemeSchemeId | null {
  const raw = getDeployEnv("VITE_DEFAULT_SCHEME") as unknown;
  return isThemeSchemeId(raw) ? raw : null;
}

function getSystemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function getInitialThemePreference(): ThemePreference {
  const saved = localStorage.getItem(STORAGE_THEME);
  if (isThemePreference(saved)) return saved;

  const env = envDefaultTheme();
  if (env === "light" || env === "dark" || env === "system") return env;

  return "system";
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
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => getInitialThemePreference());
  const [systemTheme, setSystemTheme] = useState<Theme>(() => getSystemTheme());
  const [scheme, _setScheme] = useState<ThemeSchemeId>(() => getInitialScheme());

  // Do not auto-write defaults into localStorage.
  // We only persist when the user explicitly changes theme/scheme (later: Settings UI).
  const shouldPersistThemeRef = useRef(localStorage.getItem(STORAGE_THEME) !== null);
  const shouldPersistSchemeRef = useRef(localStorage.getItem(STORAGE_SCHEME) !== null);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => setSystemTheme(mq.matches ? "dark" : "light");
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme: Theme = themePreference === "system" ? systemTheme : themePreference;

  const toggleTheme = useCallback(() => {
    shouldPersistThemeRef.current = true;
    setThemePreferenceState((prev) => {
      const current: Theme = prev === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light") : prev;
      return current === "light" ? "dark" : "light";
    });
  }, []);

  const setThemePreference = useCallback((pref: ThemePreference) => {
    shouldPersistThemeRef.current = true;
    setThemePreferenceState(pref);
  }, []);

  const setScheme = useCallback((next: ThemeSchemeId) => {
    shouldPersistSchemeRef.current = true;
    _setScheme(next);
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    // Keep compatibility with CSS that expects a `.light-theme` class toggle.
    // We treat "light" as opt-in, and "dark" as the default/base (class removed).
    document.body.classList.toggle("light-theme", theme === "light");
  }, [theme]);

  useEffect(() => {
    document.body.dataset.scheme = scheme;
  }, [scheme]);

  useEffect(() => {
    if (!shouldPersistThemeRef.current) return;
    localStorage.setItem(STORAGE_THEME, themePreference);
  }, [themePreference]);

  useEffect(() => {
    if (!shouldPersistSchemeRef.current) return;
    localStorage.setItem(STORAGE_SCHEME, scheme);
  }, [scheme]);

  const value = useMemo(
    () => ({ theme, toggleTheme, themePreference, setThemePreference, scheme, setScheme }),
    [theme, toggleTheme, themePreference, setThemePreference, scheme, setScheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}


