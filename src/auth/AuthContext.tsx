import { createContext, useContext, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { normalizeSession, getPrimaryMailAccountId, type JmapSession } from "../jmap/normalizeSession";

export interface AuthState {
  authHeader: string;
  session: JmapSession;
  accountId: string;
}

interface AuthContextValue {
  auth: AuthState | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);

  const signIn = async (email: string, password: string) => {
    // Use the identifier as entered (some Stalwart setups authenticate by full email address).
    const identifier = email.trim();
    const authHeader = "Basic " + btoa(`${identifier}:${password}`);

    // Stalwart redirects `/.well-known/jmap` -> `/jmap/session` (307).
    // Some clients can mishandle auth headers across redirects, so request `/jmap/session` directly.
    const response = await fetch("/jmap/session", {
      headers: { Authorization: authHeader }
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          'Invalid username/email or password. For local Stalwart dev, try "admin" / "admin" or "test@domain.ote" / "111".'
        );
      }
      throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
    }

    const rawSession = (await response.json()) as JmapSession;
    const session = normalizeSession(rawSession);

    if (!session.apiUrl) {
      throw new Error("Invalid JMAP session: missing apiUrl");
    }

    // If we got a public (unauthenticated) session, Stalwart returns no accounts.
    if (!session.accounts || Object.keys(session.accounts).length === 0) {
      throw new Error(
        'Authenticated session contains no accounts. If you are running locally, try "admin" / "admin" or create a mailbox user in the Stalwart admin UI on `http://localhost:8080`.'
      );
    }

    const accountId = getPrimaryMailAccountId(session);
    if (!accountId) {
      throw new Error("No mail account found in JMAP session");
    }

    setAuth({ authHeader, session, accountId });
  };

  const signOut = () => {
    setAuth(null);
  };

  return (
    <AuthContext.Provider value={{ auth, signIn, signOut }}>
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
  const { auth } = useAuth();
  const location = useLocation();

  if (!auth) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
