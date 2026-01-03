import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi, beforeEach } from "vitest";

import { AuthProvider, useAuth, isAuthError } from "./AuthContext";

function makeSession() {
  return {
    apiUrl: "https://localhost/jmap",
    downloadUrl: "https://localhost/download/{accountId}/{blobId}/{name}?type={type}",
    uploadUrl: "https://localhost/upload/{accountId}/{name}?type={type}",
    accounts: {
      acc1: {
        name: "user@example.test",
        accountCapabilities: {
          "urn:ietf:params:jmap:mail": {},
          "urn:ietf:params:jmap:submission": {}
        }
      }
    },
    primaryAccounts: {
      "urn:ietf:params:jmap:mail": "acc1",
      "urn:ietf:params:jmap:submission": "acc1"
    },
    capabilities: {}
  };
}

function Probe() {
  const { activeAuth, rehydrating, signIn } = useAuth();
  return (
    <div>
      <div data-testid="rehydrating">{String(rehydrating)}</div>
      <div data-testid="authed">{activeAuth ? "yes" : "no"}</div>
      <button
        type="button"
        onClick={() => {
          void signIn("user@example.test", "pw");
        }}
      >
        sign-in
      </button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("AuthContext", () => {
  test("signIn stores auth and activates the session", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify(makeSession()), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    // Wait for initial rehydration to finish.
    await waitFor(() => expect(screen.getByTestId("rehydrating").textContent).toBe("false"));

    await userEvent.click(screen.getByRole("button", { name: "sign-in" }));

    await waitFor(() => expect(screen.getByTestId("authed").textContent).toBe("yes"));

    // Ensure we called the canonical session endpoint and included Authorization.
    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls.find((c) => String(c[0]) === "/jmap/session") ?? [];
    expect(url).toBe("/jmap/session");
    expect((init as RequestInit)?.headers).toEqual(
      expect.objectContaining({
        Authorization: expect.stringMatching(/^Basic\s+/)
      })
    );

    // Ensure auth header is persisted for rehydration.
    const stored = localStorage.getItem("duckwebmail:authHeadersByProfile");
    expect(stored).toBeTruthy();
    expect(stored).toContain("Basic");
  });

  test("signIn throws AuthError(kind=invalid_credentials) on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }))
    );

    let caught: unknown = null;
    function Catcher() {
      const { signIn } = useAuth();
      return (
        <button
          type="button"
          onClick={async () => {
            try {
              await signIn("user@example.test", "bad");
            } catch (e) {
              caught = e;
            }
          }}
        >
          go
        </button>
      );
    }

    render(
      <AuthProvider>
        <Catcher />
      </AuthProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: "go" }));

    await waitFor(() => expect(caught).not.toBeNull());
    expect(isAuthError(caught)).toBe(true);
    if (isAuthError(caught)) {
      expect(caught.kind).toBe("invalid_credentials");
      expect(caught.status).toBe(401);
    }
  });

  test("rehydration drops invalid stored auth headers", async () => {
    // Simulate a previous login.
    localStorage.setItem(
      "duckwebmail:authHeadersByProfile",
      JSON.stringify({ personal: { authHeader: "Basic Zm9vOmJhcg==" } })
    );

    // Server rejects stored credentials.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }))
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId("rehydrating").textContent).toBe("false"));
    expect(screen.getByTestId("authed").textContent).toBe("no");

    const stored = localStorage.getItem("duckwebmail:authHeadersByProfile");
    expect(stored).toBe(JSON.stringify({}));
  });
});


