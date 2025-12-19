/**
 * JMAP over WebSocket push client (RFC 8887).
 *
 * Connects to Stalwart's WebSocket endpoint and subscribes to StateChange
 * notifications for Email and Mailbox types.
 */

export interface StateChange {
  "@type": "StateChange";
  changed: Record<string, Record<string, string>>;
  pushState?: string;
}

export interface JmapPushMetrics {
  stateChangesReceived: number;
  refreshesTriggered: number;
  lastChangeAt: number | null;
  connectionOpenedAt: number | null;
}

export type StateChangeCallback = (change: StateChange) => void;

export interface JmapPushClientOptions {
  /** Normalized webSocketUrl path from session (e.g. /jmap/ws/) */
  webSocketUrl: string;
  /** Basic auth header value (e.g. "Basic xyz...") */
  authHeader: string;
  /** Data types to subscribe to */
  dataTypes?: string[];
  /** Called when a StateChange is received */
  onStateChange?: StateChangeCallback;
  /** Called when the connection opens */
  onOpen?: () => void;
  /** Called when the connection closes */
  onClose?: (event: CloseEvent) => void;
  /** Called on error */
  onError?: (error: Event) => void;
  /** Dev-mode logging */
  debug?: boolean;
}

function log(debug: boolean | undefined, ...args: unknown[]) {
  if (debug) {
    console.log("[JmapPush]", ...args);
  }
}

function buildWsUrl(path: string, authHeader: string): string {
  // Build absolute WebSocket URL with auth in query param for Vite proxy
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;

  // Ensure path starts with /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  // Pass auth as query param - the Vite proxy will inject it as Authorization header
  const authParam = encodeURIComponent(authHeader);
  const separator = normalizedPath.includes("?") ? "&" : "?";

  return `${protocol}//${host}${normalizedPath}${separator}auth=${authParam}`;
}

function isStateChange(data: unknown): data is StateChange {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return obj["@type"] === "StateChange" && typeof obj.changed === "object";
}

export class JmapPushClient {
  private ws: WebSocket | null = null;
  private options: JmapPushClientOptions;
  private closed = false;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelayMs = 2000;

  public metrics: JmapPushMetrics = {
    stateChangesReceived: 0,
    refreshesTriggered: 0,
    lastChangeAt: null,
    connectionOpenedAt: null
  };

  constructor(options: JmapPushClientOptions) {
    this.options = {
      dataTypes: ["Email", "Mailbox"],
      ...options
    };
  }

  connect(): void {
    if (this.closed) {
      log(this.options.debug, "Client is closed, not connecting");
      return;
    }

    if (this.ws) {
      log(this.options.debug, "Already connected or connecting");
      return;
    }

    const wsUrl = buildWsUrl(this.options.webSocketUrl, this.options.authHeader);
    log(this.options.debug, "Connecting to", wsUrl.replace(/auth=[^&]+/, "auth=***"));

    try {
      // Use jmap subprotocol as per RFC 8887
      this.ws = new WebSocket(wsUrl, ["jmap"]);
    } catch (err) {
      log(this.options.debug, "Failed to create WebSocket:", err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      log(this.options.debug, "WebSocket connected");
      this.reconnectAttempts = 0;
      this.metrics.connectionOpenedAt = Date.now();

      // Enable push for specified data types
      this.sendPushEnable();

      this.options.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = (event) => {
      log(this.options.debug, "WebSocket closed:", event.code, event.reason);
      this.ws = null;
      this.options.onClose?.(event);

      if (!this.closed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (event) => {
      log(this.options.debug, "WebSocket error:", event);
      this.options.onError?.(event);
    };
  }

  private sendPushEnable(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const enableMsg = {
      "@type": "WebSocketPushEnable",
      dataTypes: this.options.dataTypes
    };

    log(this.options.debug, "Sending WebSocketPushEnable:", enableMsg);
    this.ws.send(JSON.stringify(enableMsg));
  }

  private handleMessage(data: string | ArrayBuffer | Blob): void {
    if (typeof data !== "string") {
      log(this.options.debug, "Received non-string message, ignoring");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      log(this.options.debug, "Failed to parse message as JSON:", data);
      return;
    }

    log(this.options.debug, "Received message:", parsed);

    if (isStateChange(parsed)) {
      this.metrics.stateChangesReceived++;
      this.metrics.lastChangeAt = Date.now();
      log(this.options.debug, "StateChange received:", parsed.changed);
      this.options.onStateChange?.(parsed);
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    if (this.reconnectTimeoutId) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log(this.options.debug, "Max reconnect attempts reached, giving up");
      return;
    }

    const delay = this.reconnectDelayMs * Math.pow(1.5, this.reconnectAttempts);
    this.reconnectAttempts++;

    log(this.options.debug, `Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.connect();
    }, delay);
  }

  /** Increment refresh counter (called by consumer when it refreshes data) */
  recordRefresh(): void {
    this.metrics.refreshesTriggered++;
  }

  /** Send a JMAP request over the WebSocket (for future use) */
  sendRequest(request: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(request));
  }

  /** Check if the WebSocket is currently connected */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /** Gracefully close the WebSocket connection */
  close(): void {
    log(this.options.debug, "Closing WebSocket client");
    this.closed = true;

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    if (this.ws) {
      // Send push disable before closing
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ "@type": "WebSocketPushDisable" }));
        } catch {
          // Ignore errors when sending disable
        }
      }
      this.ws.close(1000, "Client closed");
      this.ws = null;
    }
  }
}

/**
 * Helper to check if a StateChange affects a specific data type.
 */
export function stateChangeAffects(change: StateChange, dataType: string): boolean {
  for (const accountChanges of Object.values(change.changed)) {
    if (dataType in accountChanges) {
      return true;
    }
  }
  return false;
}

/**
 * Helper to check if a StateChange affects a specific account + data type.
 *
 * Some servers may include changes for multiple accounts in a single websocket session,
 * so consumers should filter by the account they are currently displaying.
 */
export function stateChangeAffectsAccount(change: StateChange, accountId: string, dataType: string): boolean {
  const accountChanges = change.changed?.[accountId];
  if (!accountChanges) return false;
  return dataType in accountChanges;
}
