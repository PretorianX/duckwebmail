import { describe, expect, test, vi } from "vitest";

vi.mock("./client", () => {
  const jmapRequest = vi.fn(async (_apiUrl: string, _authHeader: string, _caps: string[], methodCalls: unknown[]) => {
    // Assert inside mock to keep the test focused on the payload we send.
    const call = (methodCalls as any[])?.[0];
    const args = call?.[1] as any;
    const callId = call?.[2] as string;

    const createKey = Object.keys(args?.create ?? {})[0];
    return {
      methodResponses: [
        [
          "EmailSubmission/set",
          {
            accountId: args.accountId,
            created: { [createKey]: { id: "sub1" } }
          },
          callId
        ]
      ]
    };
  });

  return {
    jmapRequest,
    generateCallId: (prefix: string) => (prefix === "sub" ? "sub-1" : prefix === "send" ? "send-1" : `${prefix}-1`),
    isErrorResponse: () => false,
    findResponse: (methodResponses: any[], callId: string) => methodResponses.find((r) => r[2] === callId)?.[1]
  };
});

import { sendEmailSubmission } from "./compose";

describe("sendEmailSubmission", () => {
  test("marks the sent email as seen when moving Drafts -> Sent", async () => {
    await sendEmailSubmission({
      apiUrl: "/jmap",
      authHeader: "Basic abc",
      accountId: "subAcc",
      identity: { id: "ident1", email: "from@mail.test" },
      emailId: "email1",
      draftsMailboxId: "drafts",
      sentMailboxId: "sent",
      to: "to@mail.test"
    });

    const { jmapRequest } = await import("./client");
    expect(vi.mocked(jmapRequest)).toHaveBeenCalledTimes(1);

    const methodCalls = vi.mocked(jmapRequest).mock.calls[0]?.[3] as any[];
    const args = methodCalls?.[0]?.[1] as any;

    expect(args.onSuccessUpdateEmail["#send-1"]["keywords/$seen"]).toBe(true);
    expect(args.onSuccessUpdateEmail["#send-1"]["keywords/$draft"]).toBe(null);
    expect(args.onSuccessUpdateEmail["#send-1"]["mailboxIds/drafts"]).toBe(null);
    expect(args.onSuccessUpdateEmail["#send-1"]["mailboxIds/sent"]).toBe(true);
  });
});


