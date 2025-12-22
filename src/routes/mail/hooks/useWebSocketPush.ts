import { useEffect, useRef, type MutableRefObject } from "react";
import { clearEmailListCacheForAccount } from "../../../jmap/email";
import { JmapPushClient, stateChangeAffectsAccount, type StateChange } from "../../../jmap/webSocketPush";

type Auth = {
  session: { apiUrl: string; webSocketUrl?: string };
  authHeader: string;
  accountId: string;
} | null;

type UseWebSocketPushParams = {
  auth: Auth;
  folderIdRef: MutableRefObject<string>;
  loadMailboxes: (opts?: { force?: boolean }) => Promise<void>;
  refreshHead: () => Promise<void>;
};

export function useWebSocketPush({ auth, folderIdRef, loadMailboxes, refreshHead }: UseWebSocketPushParams) {
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushClientRef = useRef<JmapPushClient | null>(null);

  useEffect(() => {
    if (!auth) return;
    const wsUrl = auth.session.webSocketUrl;
    if (!wsUrl) {
      console.log("[JmapPush] No webSocketUrl in session, push disabled");
      return;
    }

    const debounceMs = 800;

    const handleStateChange = (change: StateChange) => {
      const affectsMailbox = stateChangeAffectsAccount(change, auth.accountId, "Mailbox");
      const affectsEmail = stateChangeAffectsAccount(change, auth.accountId, "Email");

      if (!affectsMailbox && !affectsEmail) return;

      console.log("[JmapPush] StateChange received:", {
        affectsMailbox,
        affectsEmail,
        changed: change.changed
      });

      if (affectsEmail) {
        clearEmailListCacheForAccount({ apiUrl: auth.session.apiUrl, accountId: auth.accountId });
      }

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        const startTime = performance.now();

        const refreshPromises: Promise<void>[] = [];

        if (affectsMailbox) {
          console.log("[JmapPush] Refreshing mailboxes...");
          refreshPromises.push(
            (async () => {
              await loadMailboxes({ force: true });
              console.log("[JmapPush] Mailboxes refreshed in", Math.round(performance.now() - startTime), "ms");
            })()
          );
        }

        if (affectsEmail && folderIdRef.current) {
          console.log("[JmapPush] Refreshing message list head...");
          refreshPromises.push(
            (async () => {
              await refreshHead();
              console.log("[JmapPush] Message list head refreshed in", Math.round(performance.now() - startTime), "ms");
            })()
          );
        }

        if (pushClientRef.current) {
          pushClientRef.current.recordRefresh();
        }

        void Promise.all(refreshPromises);
      }, debounceMs);
    };

    const client = new JmapPushClient({
      webSocketUrl: wsUrl,
      authHeader: auth.authHeader,
      dataTypes: ["Email", "Mailbox"],
      onStateChange: handleStateChange,
      onOpen: () => {
        console.log("[JmapPush] Connected to JMAP WebSocket");
        console.log("[JmapPush] Tip: Access metrics via window.__jmapPushMetrics()");
      },
      onClose: (event) => {
        const m = client.metrics;
        const sessionDurationMs = m.connectionOpenedAt ? Date.now() - m.connectionOpenedAt : 0;
        console.log("[JmapPush] WebSocket closed:", event.code, event.reason);
        console.log("[JmapPush] Session metrics:", {
          sessionDurationMs,
          sessionDurationSec: Math.round(sessionDurationMs / 1000),
          stateChangesReceived: m.stateChangesReceived,
          refreshesTriggered: m.refreshesTriggered,
          lastChangeAt: m.lastChangeAt ? new Date(m.lastChangeAt).toISOString() : null
        });
      },
      onError: () => {
        console.log("[JmapPush] WebSocket error");
      },
      debug: true
    });

    pushClientRef.current = client;
    client.connect();

    // Expose metrics to window for debugging
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__jmapPushMetrics = () => {
      const m = client.metrics;
      const sessionDurationMs = m.connectionOpenedAt ? Date.now() - m.connectionOpenedAt : 0;
      return {
        connected: client.isConnected(),
        sessionDurationMs,
        sessionDurationSec: Math.round(sessionDurationMs / 1000),
        stateChangesReceived: m.stateChangesReceived,
        refreshesTriggered: m.refreshesTriggered,
        lastChangeAt: m.lastChangeAt ? new Date(m.lastChangeAt).toISOString() : null
      };
    };

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      const m = client.metrics;
      const sessionDurationMs = m.connectionOpenedAt ? Date.now() - m.connectionOpenedAt : 0;
      console.log("[JmapPush] Closing - Final metrics:", {
        sessionDurationMs,
        sessionDurationSec: Math.round(sessionDurationMs / 1000),
        stateChangesReceived: m.stateChangesReceived,
        refreshesTriggered: m.refreshesTriggered
      });
      client.close();
      pushClientRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__jmapPushMetrics;
    };
  }, [auth?.accountId, auth?.authHeader, auth?.session.webSocketUrl, folderIdRef, loadMailboxes, refreshHead]);
}

