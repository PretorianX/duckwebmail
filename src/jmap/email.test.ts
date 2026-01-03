import { describe, expect, test, vi, beforeEach } from "vitest";

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

let nextError: { type: string; description?: string } | null = null;
let callSeq = 0;

vi.mock("./client", () => {
  const jmapRequest = vi.fn(async (_apiUrl: string, _authHeader: string, _caps: string[], methodCalls: unknown[]) => {
    const call = asArray(methodCalls)[0];
    const callArr = asArray(call);
    const methodName = typeof callArr[0] === "string" ? callArr[0] : "";
    const args = asRecord(callArr[1]);
    const callId = typeof callArr[2] === "string" ? callArr[2] : "c1";

    if (nextError) {
      const err = nextError;
      nextError = null;
      return { methodResponses: [["error", { type: err.type, description: err.description }, callId]] };
    }

    return {
      methodResponses: [[methodName, { accountId: String(args.accountId ?? "") }, callId]]
    };
  });

  return {
    jmapRequest,
    generateCallId: (prefix = "c") => `${prefix}${++callSeq}`,
    isErrorResponse: (r: unknown) => asArray(r)[0] === "error",
    findResponse: (methodResponses: unknown[], callId: string) =>
      asArray(methodResponses).find((r) => asArray(r)[2] === callId)?.[1]
  };
});

import { destroyEmail, markEmailAsRead, markEmailAsUnread, moveEmailToMailbox, setEmailStarred } from "./email";

beforeEach(() => {
  nextError = null;
  callSeq = 0;
});

describe("email.ts JMAP operations", () => {
  test("markEmailAsRead sets keywords/$seen=true", async () => {
    const ok = await markEmailAsRead({ apiUrl: "/jmap", authHeader: "Basic abc", accountId: "acc", emailId: "e1" });
    expect(ok).toBe(true);

    const { jmapRequest } = await import("./client");
    const methodCalls = vi.mocked(jmapRequest).mock.calls.at(-1)?.[3];
    const args = asRecord(asArray(asArray(methodCalls)[0])[1]);
    const update = asRecord(asRecord(args.update)["e1"]);
    expect(update["keywords/$seen"]).toBe(true);
  });

  test("markEmailAsUnread removes keywords/$seen via null patch", async () => {
    const ok = await markEmailAsUnread({ apiUrl: "/jmap", authHeader: "Basic abc", accountId: "acc", emailId: "e1" });
    expect(ok).toBe(true);

    const { jmapRequest } = await import("./client");
    const methodCalls = vi.mocked(jmapRequest).mock.calls.at(-1)?.[3];
    const args = asRecord(asArray(asArray(methodCalls)[0])[1]);
    const update = asRecord(asRecord(args.update)["e1"]);
    expect(update["keywords/$seen"]).toBe(null);
  });

  test("setEmailStarred toggles keywords/$flagged", async () => {
    const ok1 = await setEmailStarred({
      apiUrl: "/jmap",
      authHeader: "Basic abc",
      accountId: "acc",
      emailId: "e1",
      starred: true
    });
    expect(ok1).toBe(true);

    const { jmapRequest } = await import("./client");
    let methodCalls = vi.mocked(jmapRequest).mock.calls.at(-1)?.[3];
    let args = asRecord(asArray(asArray(methodCalls)[0])[1]);
    let update = asRecord(asRecord(args.update)["e1"]);
    expect(update["keywords/$flagged"]).toBe(true);

    const ok2 = await setEmailStarred({
      apiUrl: "/jmap",
      authHeader: "Basic abc",
      accountId: "acc",
      emailId: "e1",
      starred: false
    });
    expect(ok2).toBe(true);

    methodCalls = vi.mocked(jmapRequest).mock.calls.at(-1)?.[3];
    args = asRecord(asArray(asArray(methodCalls)[0])[1]);
    update = asRecord(asRecord(args.update)["e1"]);
    expect(update["keywords/$flagged"]).toBe(null);
  });

  test("destroyEmail uses destroy: [emailId]", async () => {
    const ok = await destroyEmail({ apiUrl: "/jmap", authHeader: "Basic abc", accountId: "acc", emailId: "e1" });
    expect(ok).toBe(true);

    const { jmapRequest } = await import("./client");
    const methodCalls = vi.mocked(jmapRequest).mock.calls.at(-1)?.[3];
    const args = asRecord(asArray(asArray(methodCalls)[0])[1]);
    expect(args.destroy).toEqual(["e1"]);
  });

  test("moveEmailToMailbox patches mailboxIds/from=null and mailboxIds/to=true", async () => {
    await moveEmailToMailbox({
      apiUrl: "/jmap",
      authHeader: "Basic abc",
      accountId: "acc",
      emailId: "e1",
      fromMailboxId: "inbox",
      toMailboxId: "archive"
    });

    const { jmapRequest } = await import("./client");
    const methodCalls = vi.mocked(jmapRequest).mock.calls.at(-1)?.[3];
    const args = asRecord(asArray(asArray(methodCalls)[0])[1]);
    const update = asRecord(asRecord(args.update)["e1"]);
    expect(update["mailboxIds/inbox"]).toBe(null);
    expect(update["mailboxIds/archive"]).toBe(true);
  });

  test("returns false (not throw) when server returns an error response", async () => {
    nextError = { type: "serverFail", description: "nope" };
    const ok = await markEmailAsRead({ apiUrl: "/jmap", authHeader: "Basic abc", accountId: "acc", emailId: "e1" });
    expect(ok).toBe(false);
  });
});


