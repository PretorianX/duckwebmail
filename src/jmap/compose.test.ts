import { describe, expect, test, vi } from "vitest";
import type { JmapSession } from "./normalizeSession";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

vi.mock("./client", () => {
  const jmapRequest = vi.fn(async (_apiUrl: string, _authHeader: string, _caps: string[], methodCalls: unknown[]) => {
    // Assert inside mock to keep the test focused on the payload we send.
    const call = asArray(methodCalls)[0];
    const callArr = asArray(call);
    const methodName = typeof callArr[0] === "string" ? callArr[0] : "";
    const args = asRecord(callArr[1]);
    const callId = typeof callArr[2] === "string" ? callArr[2] : "call-1";

    const createKey = Object.keys(asRecord(args.create))[0] ?? "create-1";
    return {
      methodResponses: [
        [
          methodName,
          (() => {
            if (methodName === "EmailSubmission/set") {
              return {
                accountId: String(args.accountId ?? ""),
                created: { [createKey]: { id: "sub1" } }
              };
            }

            if (methodName === "Email/set") {
              return {
                accountId: String(args.accountId ?? ""),
                created: { [createKey]: { id: "email1" } }
              };
            }

            return { accountId: String(args.accountId ?? "") };
          })(),
          callId
        ]
      ]
    };
  });

  return {
    jmapRequest,
    generateCallId: (prefix: string) => (prefix === "sub" ? "sub-1" : prefix === "send" ? "send-1" : `${prefix}-1`),
    isErrorResponse: () => false,
    findResponse: (methodResponses: unknown[], callId: string) =>
      asArray(methodResponses).find((r) => asArray(r)[2] === callId)?.[1]
  };
});

import { sendEmailSubmission, upsertDraftEmail } from "./compose";

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

    const methodCalls = vi.mocked(jmapRequest).mock.calls[0]?.[3];
    const firstCall = asArray(methodCalls)[0];
    const args = asRecord(asArray(firstCall)[1]);
    const onSuccessUpdateEmail = asRecord(args.onSuccessUpdateEmail);
    const update = asRecord(onSuccessUpdateEmail["#send-1"]);

    expect(update["keywords/$seen"]).toBe(true);
    expect(update["keywords/$draft"]).toBe(null);
    expect(update["mailboxIds/drafts"]).toBe(null);
    expect(update["mailboxIds/sent"]).toBe(true);
  });
});

describe("upsertDraftEmail", () => {
  test("always includes text/plain + text/html as multipart/alternative", async () => {
    const session = { apiUrl: "/jmap", uploadUrl: "/upload" } as unknown as JmapSession;
    await upsertDraftEmail({
      session,
      authHeader: "Basic abc",
      accountId: "acc1",
      draftsMailboxId: "drafts",
      from: "from@mail.test",
      to: "to@mail.test",
      subject: "Subj",
      htmlBody: "<p>Hello<br>world</p>",
      attachments: []
    });

    const { jmapRequest } = await import("./client");
    const methodCalls = vi.mocked(jmapRequest).mock.calls.at(-1)?.[3];
    const firstCall = asArray(methodCalls)[0];
    const callArr = asArray(firstCall);
    const methodName = callArr[0];
    const args = asRecord(callArr[1]);

    expect(methodName).toBe("Email/set");
    const create = asRecord(args.create);
    const createKey = Object.keys(create)[0] ?? "create-1";
    const email = asRecord(create[createKey]);
    const bodyStructure = asRecord(email.bodyStructure);
    const subParts = asArray(bodyStructure.subParts);
    const bodyValues = asRecord(email.bodyValues);
    const v1 = asRecord(bodyValues["1"]);
    const v2 = asRecord(bodyValues["2"]);

    expect(bodyStructure.type).toBe("multipart/alternative");
    expect(asRecord(subParts[0]).type).toBe("text/plain");
    expect(asRecord(subParts[0]).partId).toBe("1");
    expect(asRecord(subParts[1]).type).toBe("text/html");
    expect(asRecord(subParts[1]).partId).toBe("2");

    expect(v1.value).toBe("Hello\nworld");
    expect(v2.value).toBe("<p>Hello<br>world</p>");
  });

  test("renders lists, blockquotes, and links in a readable plain-text form", async () => {
    const session = { apiUrl: "/jmap", uploadUrl: "/upload" } as unknown as JmapSession;
    await upsertDraftEmail({
      session,
      authHeader: "Basic abc",
      accountId: "acc1",
      draftsMailboxId: "drafts",
      from: "from@mail.test",
      to: "to@mail.test",
      subject: "Subj",
      htmlBody:
        '<p>Intro</p><ul><li>One</li><li>Two <a href="https://example.test/x">link</a></li></ul><blockquote><p>Quoted<br>line</p></blockquote>',
      attachments: []
    });

    const { jmapRequest } = await import("./client");
    const methodCalls = vi.mocked(jmapRequest).mock.calls.at(-1)?.[3];
    const firstCall = asArray(methodCalls)[0];
    const args = asRecord(asArray(firstCall)[1]);
    const create = asRecord(args.create);
    const createKey = Object.keys(create)[0] ?? "create-1";
    const email = asRecord(create[createKey]);
    const bodyValues = asRecord(email.bodyValues);
    const text = String(asRecord(bodyValues["1"]).value ?? "");

    expect(text).toContain("Intro");
    expect(text).toContain("- One");
    expect(text).toContain("- Two link (https://example.test/x)");
    expect(text).toContain("> Quoted");
    expect(text).toContain("> line");
  });
});


