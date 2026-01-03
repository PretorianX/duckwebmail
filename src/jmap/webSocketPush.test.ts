import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";

import { JmapPushClient } from "./webSocketPush";

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static last: MockWebSocket | null = null;

  url: string;
  protocols?: string | string[];
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  closedWith: { code?: number; reason?: string } | null = null;

  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.last = this;
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.closedWith = { code, reason };
    this.onclose?.({ code: code ?? 1000, reason: reason ?? "" });
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  triggerMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

beforeEach(() => {
  MockWebSocket.last = null;
  vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("JmapPushClient", () => {
  test("connect() opens a websocket with jmap subprotocol and sends WebSocketPushEnable on open", () => {
    const client = new JmapPushClient({
      webSocketUrl: "/jmap/ws",
      authHeader: "Basic abc"
    });

    client.connect();
    const ws = MockWebSocket.last;
    expect(ws).not.toBeNull();
    expect(ws?.protocols).toEqual(["jmap"]);
    expect(ws?.url).toContain("/jmap/ws");
    expect(ws?.url).toContain("auth=");

    ws!.triggerOpen();

    expect(ws!.sent.length).toBeGreaterThanOrEqual(1);
    const enable = JSON.parse(ws!.sent[0] ?? "{}") as Record<string, unknown>;
    expect(enable["@type"]).toBe("WebSocketPushEnable");
    expect(enable.dataTypes).toEqual(["Email", "Mailbox"]);
  });

  test("handles StateChange messages and updates metrics + invokes callback", () => {
    const onStateChange = vi.fn();
    const client = new JmapPushClient({
      webSocketUrl: "/jmap/ws",
      authHeader: "Basic abc",
      onStateChange
    });

    client.connect();
    const ws = MockWebSocket.last!;
    ws.triggerOpen();

    ws.triggerMessage({
      "@type": "StateChange",
      changed: { acc1: { Email: "s1" } }
    });

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(client.metrics.stateChangesReceived).toBe(1);
    expect(client.metrics.lastChangeAt).not.toBeNull();
  });

  test("schedules reconnect after unexpected close", () => {
    vi.useFakeTimers();
    const client = new JmapPushClient({
      webSocketUrl: "/jmap/ws",
      authHeader: "Basic abc"
    });

    client.connect();
    const ws = MockWebSocket.last!;
    ws.triggerOpen();

    // Unexpected close triggers reconnect scheduling.
    ws.onclose?.({ code: 1006, reason: "abnormal" });

    // Reconnect is scheduled via setTimeout.
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    vi.runOnlyPendingTimers();
  });

  test("close() sends WebSocketPushDisable when open, then closes socket", () => {
    const client = new JmapPushClient({
      webSocketUrl: "/jmap/ws",
      authHeader: "Basic abc"
    });

    client.connect();
    const ws = MockWebSocket.last!;
    ws.triggerOpen();

    client.close();

    expect(ws.sent.some((p) => p.includes("WebSocketPushDisable"))).toBe(true);
    expect(ws.closedWith?.code).toBe(1000);
  });
});


