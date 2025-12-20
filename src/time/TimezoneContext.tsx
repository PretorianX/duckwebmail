/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { isTimeZoneId, TIMEZONE_OPTIONS, type TimeZoneId } from "./timezones";

export const STORAGE_TIMEZONE = "duckwebmail:timeZone";

type TimezoneContextValue = {
  timeZone: TimeZoneId;
  setTimeZone: (tz: TimeZoneId) => void;
  supportedTimeZones: readonly TimeZoneId[];
};

const TimezoneContext = createContext<TimezoneContextValue | undefined>(undefined);

export function useTimezone(): TimezoneContextValue {
  const ctx = useContext(TimezoneContext);
  if (!ctx) throw new Error("useTimezone must be used within TimezoneProvider");
  return ctx;
}

function getEnvTimeZone(): string | undefined {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function getInitialTimeZone(): TimeZoneId {
  const saved = localStorage.getItem(STORAGE_TIMEZONE);
  if (isTimeZoneId(saved)) return saved;
  const env = getEnvTimeZone();
  return isTimeZoneId(env) ? env : "UTC";
}

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timeZone, setTimeZoneState] = useState<TimeZoneId>(() => getInitialTimeZone());

  // Do not auto-write defaults into localStorage.
  // We only persist when the user explicitly changes time zone.
  const shouldPersistRef = useRef(localStorage.getItem(STORAGE_TIMEZONE) !== null);

  useEffect(() => {
    if (!shouldPersistRef.current) return;
    localStorage.setItem(STORAGE_TIMEZONE, timeZone);
  }, [timeZone]);

  const setTimeZone = useCallback((tz: TimeZoneId) => {
    shouldPersistRef.current = true;
    setTimeZoneState(tz);
  }, []);

  const value = useMemo(
    () => ({ timeZone, setTimeZone, supportedTimeZones: TIMEZONE_OPTIONS.map((z) => z.id) }),
    [timeZone, setTimeZone]
  );

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}


