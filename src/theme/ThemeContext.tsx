/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
type ThemeContextValue = { theme: Theme; toggleTheme: () => void };

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

const MOBILE_MEDIA_QUERY = "(max-width: 880px)";

function getSystemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialTheme(): Theme {
  const saved = localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") return saved;
  return getSystemTheme();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [manualTheme, setManualTheme] = useState<Theme>(() => getInitialTheme());
  const [systemTheme, setSystemTheme] = useState<Theme>(() => getSystemTheme());
  const [isMobile, setIsMobile] = useState<boolean>(() => window.matchMedia?.(MOBILE_MEDIA_QUERY).matches ?? false);

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

  const toggleTheme = () => {
    // Mobile follows the device theme; manual switching is desktop-only.
    if (isMobile) return;
    setManualTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("theme", manualTheme);
  }, [manualTheme]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, isMobile]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}


