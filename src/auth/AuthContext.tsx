/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { normalizeSession, getPrimaryMailAccountId, type JmapSession } from "../jmap/normalizeSession";
import {
  ensureProfilesPersisted,
  readActiveProfileId,
  readProfiles,
  setActiveProfileIdInStorage,
  subscribeToProfileStorageChanges,
  type Profile
} from "../shared/profileStorage";

export interface AuthState {
  authHeader: string;
  session: JmapSession;
  accountId: string;
}

export type AuthErrorKind = "invalid_credentials" | "network" | "server" | "unexpected";

export class AuthError extends Error {
  readonly kind: AuthErrorKind;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(message: string, opts: { kind: AuthErrorKind; status?: number; cause?: unknown }) {
    super(message);
    this.name = "AuthError";
    this.kind = opts.kind;
    this.status = opts.status;
    this.cause = opts.cause;
  }
}

export function isAuthError(err: unknown): err is AuthError {
  return err instanceof AuthError;
}

interface AuthContextValue {
  profiles: Profile[];
  activeProfileId: string;
  activeProfile: Profile;
  setActiveProfileId: (profileId: string) => void;
  authByProfile: Record<string, AuthState | undefined>;
  activeAuth: AuthState | null;
  rehydrating: boolean;
  signIn: (email: string, password: string, opts?: { profileId?: string }) => Promise<void>;
  signOut: (opts?: { profileId?: string }) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_AUTH_HEADERS = "duckwebmail:authHeadersByProfile";

type StoredAuthHeaders = Record<string, { authHeader: string }>;

function readStoredAuthHeaders(): StoredAuthHeaders {
  const raw = localStorage.getItem(STORAGE_AUTH_HEADERS);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: StoredAuthHeaders = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const authHeader = (v as Record<string, unknown>).authHeader;
      if (typeof authHeader !== "string" || authHeader.trim() === "") continue;
      out[String(k)] = { authHeader };
    }
    return out;
  } catch {
    return {};
  }
}

function writeStoredAuthHeaders(next: StoredAuthHeaders): void {
  localStorage.setItem(STORAGE_AUTH_HEADERS, JSON.stringify(next));
}

async function fetchJmapSession(authHeader: string): Promise<{ session: JmapSession; accountId: string }> {
  // Stalwart redirects `/.well-known/jmap` -> `/jmap/session` (307).
  // Some clients can mishandle auth headers across redirects, so request `/jmap/session` directly.
  let response: Response;
  try {
    response = await fetch("/jmap/session", {
      headers: { Authorization: authHeader }
    });
  } catch (err) {
    throw new AuthError("Network error while contacting the server", { kind: "network", cause: err });
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new AuthError("Invalid credentials", { kind: "invalid_credentials", status: 401 });
    }
    if (response.status >= 500) {
      throw new AuthError("Server error while authenticating", { kind: "server", status: response.status });
    }
    throw new AuthError(`Authentication failed: ${response.status} ${response.statusText}`, {
      kind: "unexpected",
      status: response.status
    });
  }

  const rawSession = (await response.json()) as JmapSession;
  const session = normalizeSession(rawSession);

  if (!session.apiUrl) {
    throw new AuthError("Invalid JMAP session: missing apiUrl", { kind: "unexpected" });
  }

  // If we got a public (unauthenticated) session, Stalwart returns no accounts.
  if (!session.accounts || Object.keys(session.accounts).length === 0) {
    throw new AuthError("Authenticated session contains no accounts", { kind: "unexpected" });
  }

  const accountId = getPrimaryMailAccountId(session);
  if (!accountId) {
    throw new AuthError("No mail account found in JMAP session", { kind: "unexpected" });
  }

  return { session, accountId };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>(() => readProfiles());
  const [activeProfileId, _setActiveProfileId] = useState<string>(() => readActiveProfileId(readProfiles()));
  const [authByProfile, setAuthByProfile] = useState<Record<string, AuthState | undefined>>({});
  const [rehydrating, setRehydrating] = useState(true);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? { id: "personal", name: "Personal" },
    [profiles, activeProfileId]
  );

  const activeAuth = useMemo(() => authByProfile[activeProfileId] ?? null, [authByProfile, activeProfileId]);

  const setActiveProfileId = (profileId: string) => {
    _setActiveProfileId(profileId);
    setActiveProfileIdInStorage(profileId);
  };

  useEffect(() => {
    // Ensure defaults exist in storage so ProfileMenu + app are aligned.
    ensureProfilesPersisted(profiles);
  }, [profiles]);

  useEffect(() => {
    // Keep in sync with other tabs/windows and any code that writes profile storage.
    return subscribeToProfileStorageChanges(() => {
      const nextProfiles = readProfiles();
      setProfiles((prev) => (JSON.stringify(prev) === JSON.stringify(nextProfiles) ? prev : nextProfiles));
      const nextActive = readActiveProfileId(nextProfiles);
      _setActiveProfileId((prev) => (prev === nextActive ? prev : nextActive));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setRehydrating(true);
      const stored = readStoredAuthHeaders();
      const nextAuthByProfile: Record<string, AuthState | undefined> = {};
      const nextStored: StoredAuthHeaders = { ...stored };

      const profileIds = Object.keys(stored);
      await Promise.all(
        profileIds.map(async (profileId) => {
          const authHeader = stored[profileId]?.authHeader;
          if (!authHeader) return;
          try {
            const { session, accountId } = await fetchJmapSession(authHeader);
            nextAuthByProfile[profileId] = { authHeader, session, accountId };
          } catch {
            delete nextStored[profileId];
          }
        })
      );

      if (cancelled) return;
      setAuthByProfile(nextAuthByProfile);
      writeStoredAuthHeaders(nextStored);
      setRehydrating(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (email: string, password: string, opts?: { profileId?: string }) => {
    const profileId = opts?.profileId ?? activeProfileId;
    // Use the identifier as entered (some Stalwart setups authenticate by full email address).
    const identifier = email.trim();
    const authHeader = "Basic " + btoa(`${identifier}:${password}`);
    const { session, accountId } = await fetchJmapSession(authHeader);
    setAuthByProfile((prev) => ({ ...prev, [profileId]: { authHeader, session, accountId } }));
    const stored = readStoredAuthHeaders();
    writeStoredAuthHeaders({ ...stored, [profileId]: { authHeader } });
    if (profileId !== activeProfileId) setActiveProfileId(profileId);
  };

  const signOut = (opts?: { profileId?: string }) => {
    const profileId = opts?.profileId ?? activeProfileId;
    setAuthByProfile((prev) => {
      const next = { ...prev };
      delete next[profileId];
      return next;
    });
    const stored = readStoredAuthHeaders();
    if (stored[profileId]) {
      const next = { ...stored };
      delete next[profileId];
      writeStoredAuthHeaders(next);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        profiles,
        activeProfileId,
        activeProfile,
        setActiveProfileId,
        authByProfile,
        activeAuth,
        rehydrating,
        signIn,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { activeAuth, rehydrating } = useAuth();
  const location = useLocation();

  if (rehydrating) {
    return (
      <div style={{ padding: 16, color: "var(--text-color)" }} aria-live="polite">
        Restoring session…
      </div>
    );
  }

  if (!activeAuth) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
