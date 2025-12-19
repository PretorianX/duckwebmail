/**
 * Stalwart returns absolute URLs in the JMAP session (e.g. https://localhost:10443/jmap).
 * We need to normalize them to same-origin path-only URLs so that requests go through the Vite proxy.
 */

export interface JmapSession {
  apiUrl: string;
  downloadUrl: string;
  uploadUrl: string;
  eventSourceUrl?: string;
  webSocketUrl?: string;
  accounts: Record<string, JmapAccount>;
  primaryAccounts?: Record<string, string>;
  capabilities: Record<string, unknown>;
  state?: string;
}

export interface JmapAccount {
  name: string;
  isPersonal?: boolean;
  isReadOnly?: boolean;
  accountCapabilities?: Record<string, unknown>;
}

function toPathOnly(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    // Return path + search + hash (drop origin)
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    // If it's already a relative path, return as-is
    return url;
  }
}

/**
 * Extract WebSocket URL from JMAP session.
 * Stalwart puts it in capabilities["urn:ietf:params:jmap:websocket"].url
 */
function extractWebSocketUrl(session: JmapSession): string | undefined {
  // First check top-level webSocketUrl (some servers might use this)
  if (session.webSocketUrl) {
    return session.webSocketUrl;
  }

  // Check capabilities for urn:ietf:params:jmap:websocket
  const wsCapability = session.capabilities?.["urn:ietf:params:jmap:websocket"];
  if (wsCapability && typeof wsCapability === "object") {
    const url = (wsCapability as Record<string, unknown>).url;
    if (typeof url === "string") {
      return url;
    }
  }

  return undefined;
}

export function normalizeSession(session: JmapSession): JmapSession {
  const webSocketUrl = extractWebSocketUrl(session);

  return {
    ...session,
    apiUrl: toPathOnly(session.apiUrl),
    downloadUrl: toPathOnly(session.downloadUrl),
    uploadUrl: toPathOnly(session.uploadUrl),
    eventSourceUrl: session.eventSourceUrl ? toPathOnly(session.eventSourceUrl) : undefined,
    webSocketUrl: webSocketUrl ? toPathOnly(webSocketUrl) : undefined
  };
}

export function getPrimaryMailAccountId(session: JmapSession): string | null {
  // Try primaryAccounts first
  if (session.primaryAccounts) {
    const mailAccountId = session.primaryAccounts["urn:ietf:params:jmap:mail"];
    if (mailAccountId && session.accounts[mailAccountId]) {
      return mailAccountId;
    }
  }
  // Fall back to first account with mail capability
  for (const [accountId, account] of Object.entries(session.accounts)) {
    if (account.accountCapabilities?.["urn:ietf:params:jmap:mail"]) {
      return accountId;
    }
  }
  // Fall back to first account
  const firstAccountId = Object.keys(session.accounts)[0];
  return firstAccountId ?? null;
}
