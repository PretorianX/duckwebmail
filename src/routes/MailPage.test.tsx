import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";

import MailPage from "./MailPage";
import { ThemeProvider } from "../theme/ThemeContext";
import { LanguageProvider } from "../i18n/LanguageContext";

vi.mock("../auth/AuthContext", () => {
  const activeAuth = {
    authHeader: "Basic " + btoa("test@example.com:pw"),
    accountId: "acc1",
    session: {
      apiUrl: "/jmap",
      downloadUrl: "/jmap/download/{accountId}/{blobId}/{name}?type={type}",
      uploadUrl: "/jmap/upload/{accountId}",
      accounts: { acc1: { name: "acc1" } },
      capabilities: {},
      state: "s1"
    }
  };
  const profile = { id: "personal", name: "Personal" };
  return {
    AuthProvider: ({ children }: { children: unknown }) => children,
    useAuth: () => ({
      profiles: [profile],
      activeProfileId: profile.id,
      activeProfile: profile,
      setActiveProfileId: vi.fn(),
      authByProfile: { [profile.id]: activeAuth },
      activeAuth,
      rehydrating: false,
      signIn: vi.fn(async () => {}),
      signOut: vi.fn()
    })
  };
});

vi.mock("../jmap/mailbox", () => ({
  getMailboxes: vi.fn(async () => ({
    mailboxes: [
      { id: "inbox", name: "Inbox", role: "inbox", totalEmails: 2, unreadEmails: 1 },
      { id: "archive", name: "Archive", role: "archive", totalEmails: 0, unreadEmails: 0 }
    ]
  })),
  createMailbox: vi.fn(async () => ({ ok: true, id: "new" })),
  deleteMailbox: vi.fn(async () => ({ ok: true })),
  moveMailbox: vi.fn(async () => ({ ok: true })),
  renameMailbox: vi.fn(async () => ({ ok: true }))
}));

vi.mock("../jmap/quota", () => ({
  getQuotas: vi.fn(async () => ({ quotas: [] })),
  formatQuotaBytes: (n: number) => `${n} B`
}));

vi.mock("../jmap/compose", () => ({
  getDraftsMailboxId: vi.fn(async () => "drafts"),
  getOrCreateIdentity: vi.fn(async () => ({ id: "ident1" })),
  sendEmailSubmission: vi.fn(async () => ({})),
  upsertDraftEmail: vi.fn(async () => ({ emailId: "draft1" }))
}));

vi.mock("../jmap/email", () => {
  let emails = [
    {
      id: "m1",
      blobId: "b1",
      subject: "Welcome",
      from: [{ email: "from@example.com", name: "From" }],
      to: [{ email: "to@example.com", name: "To" }],
      receivedAt: new Date("2025-01-01T00:00:00Z").toISOString(),
      preview: "Hello",
      keywords: {},
      hasAttachment: false
    },
    {
      id: "m2",
      blobId: "b2",
      subject: "Invoice #1234",
      from: [{ email: "billing@example.com", name: "Billing" }],
      to: [{ email: "to@example.com", name: "To" }],
      receivedAt: new Date("2025-01-02T00:00:00Z").toISOString(),
      preview: "Invoice",
      keywords: { $seen: true },
      hasAttachment: false
    }
  ];
  const setKeyword = (emailId: string, key: string, value: boolean | null) => {
    emails = emails.map((e) => {
      if (e.id !== emailId) return e;
      const next = { ...e, keywords: { ...(e.keywords ?? {}) } as Record<string, boolean> };
      if (value === null) {
        delete (next.keywords as Record<string, boolean>)[key];
      } else {
        (next.keywords as Record<string, boolean>)[key] = value;
      }
      return next;
    });
  };
  return {
    clearEmailListCacheForAccount: vi.fn(),
    destroyEmail: vi.fn(async ({ emailId }: { emailId: string }) => {
      emails = emails.filter((e) => e.id !== emailId);
      return true;
    }),
    formatAddressList: (value: Array<{ name?: string | null; email: string }> | undefined) =>
      (value ?? []).map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(", "),
    formatSenderForList: (value: Array<{ name?: string | null; email: string }> | undefined) => {
      const first = (value ?? [])[0];
      if (!first) return "";
      const name = (first.name ?? "").trim();
      const email = (first.email ?? "").trim();
      if (name) return name.replace(/^["']|["']$/g, "").trim();
      return email;
    },
    getEmailBody: vi.fn(async ({ emailId }: { emailId: string }) => ({
      html: `<p>Body for ${emailId}</p>`,
      text: `Body for ${emailId}`
    })),
    isStarred: (keywords: Record<string, boolean> | undefined) => !!keywords?.["$flagged"],
    isUnread: (keywords: Record<string, boolean> | undefined) => !(keywords && keywords["$seen"] === true),
    listEmailSummariesInMailbox: vi.fn(async () => ({ emails, total: emails.length, queryState: "q1" })),
    markEmailAsRead: vi.fn(async ({ emailId }: { emailId: string }) => {
      setKeyword(emailId, "$seen", true);
      return true;
    }),
    markEmailAsUnread: vi.fn(async ({ emailId }: { emailId: string }) => {
      setKeyword(emailId, "$seen", null);
      return true;
    }),
    moveEmailToMailbox: vi.fn(async () => {}),
    setEmailStarred: vi.fn(async ({ emailId, starred }: { emailId: string; starred: boolean }) => {
      setKeyword(emailId, "$flagged", starred ? true : null);
      return true;
    }),
    type: {}
  };
});

function renderMailPage() {
  return render(
    <MemoryRouter initialEntries={["/mail"]}>
      <ThemeProvider>
        <LanguageProvider>
          <MailPage />
        </LanguageProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe("MailPage", () => {
  test("allows expanding multiple messages at the same time", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMailPage();

    const welcome = await screen.findByRole("button", { name: /open welcome/i });
    const invoice = await screen.findByRole("button", { name: /open invoice #1234/i });

    await user.click(welcome);
    await user.click(invoice);

    expect(screen.getByRole("region", { name: /message welcome/i })).toBeVisible();
    expect(screen.getByRole("region", { name: /message invoice #1234/i })).toBeVisible();
  });

  test("keeps message body mounted even when collapsed (cached)", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMailPage();

    // Bodies should be in the DOM even before expanding, but hidden.
    const welcomeRegion = await screen.findByTestId("message-body-m1");
    const invoiceRegion = await screen.findByTestId("message-body-m2");
    expect(welcomeRegion).toBeInTheDocument();
    expect(invoiceRegion).toBeInTheDocument();
    expect(welcomeRegion).not.toBeVisible();

    const welcome = await screen.findByRole("button", { name: /open welcome/i });
    await user.click(welcome);
    expect(welcomeRegion).toBeVisible();

    await user.click(welcome);
    expect(welcomeRegion).not.toBeVisible();
    expect(welcomeRegion).toBeInTheDocument();
  });

  test("supports row actions: star, read/unread, delete", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMailPage();

    const welcomeRow = await screen.findByRole("button", { name: /open welcome/i });
    await user.hover(welcomeRow);
    fireEvent.click(within(welcomeRow).getByRole("button", { name: /more actions welcome/i }));
    const dialog = await screen.findByRole("dialog", { name: /message actions/i });
    const menu = within(dialog);
    expect(menu.getByRole("button", { name: /^reply$/i })).toBeInTheDocument();
    expect(menu.getByRole("button", { name: /^forward$/i })).toBeInTheDocument();
    expect(menu.getByRole("button", { name: /^(unstar|star)$/i })).toBeInTheDocument();
    expect(menu.getByRole("button", { name: /mark (read|unread)/i })).toBeInTheDocument();
    expect(menu.getByRole("button", { name: /download source/i })).toBeInTheDocument();
    expect(menu.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });

  test("reply and forward open compose with prefilled subject", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMailPage();

    const invoiceRow = await screen.findByRole("button", { name: /open invoice #1234/i });
    await user.hover(invoiceRow);
    const invoice = within(invoiceRow);

    await user.click(invoice.getByRole("button", { name: /more actions invoice #1234/i }));
    await user.click(screen.getByRole("button", { name: /^reply$/i }));
    expect(screen.getByRole("dialog", { name: /compose email/i })).toBeVisible();
    expect(screen.getByLabelText(/subject/i)).toHaveValue("Re: Invoice #1234");

    // Close dialog and open again via forward.
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    await user.click(screen.getByRole("button", { name: /discard/i }));
    await user.hover(invoiceRow);
    await user.click(invoice.getByRole("button", { name: /more actions invoice #1234/i }));
    await user.click(screen.getByRole("button", { name: /^forward$/i }));
    expect(screen.getByRole("dialog", { name: /compose email/i })).toBeVisible();
    expect(screen.getByLabelText(/subject/i)).toHaveValue("Fwd: Invoice #1234");
  });

  test("expanded message shows To line; source download is in actions menu", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderMailPage();

    const welcomeRow = await screen.findByRole("button", { name: /open welcome/i });
    await user.click(welcomeRow);

    expect(screen.getAllByText(/to:/i).length).toBeGreaterThan(0);

    // Source download lives in the row actions sheet (not in the expanded header).
    await user.hover(welcomeRow);
    await user.click(within(welcomeRow).getByRole("button", { name: /more actions welcome/i }));
    expect(screen.getByRole("button", { name: /download source/i })).toBeInTheDocument();
  });
});


