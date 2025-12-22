import { useCallback, useMemo, useRef, useState } from "react";
import type { JmapMailbox } from "../../../jmap/mailbox";
import { clearEmailListCacheForAccount } from "../../../jmap/email";
import { getDraftsMailboxId, getOrCreateIdentity, getSentMailboxId, sendEmailSubmission, upsertDraftEmail } from "../../../jmap/compose";
import { getPrimarySubmissionAccountId, type JmapSession } from "../../../jmap/normalizeSession";
import type { ComposeDraft } from "../types";
import { plainTextToHtml, decodeBasicUsername, toDatetimeLocalValue, roundToNextMinutes } from "../utils";

type Auth = {
  session: JmapSession;
  authHeader: string;
  accountId: string;
} | null;

type UseComposeParams = {
  auth: Auth;
  mailboxes: JmapMailbox[];
  activeProfileName: string;
  loadMessages: (opts?: { force?: boolean }) => Promise<void>;
  loadMailboxes: (opts?: { force?: boolean }) => Promise<void>;
};

export function useCompose({ auth, mailboxes, activeProfileName, loadMessages, loadMailboxes }: UseComposeParams) {
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMinimized, setComposeMinimized] = useState(false);
  const [composeCancelConfirmOpen, setComposeCancelConfirmOpen] = useState(false);
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeDraftEmailId, setComposeDraftEmailId] = useState<string | null>(null);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft>({ from: "", to: "", cc: "", bcc: "", subject: "", body: "" });
  const [composeShowCc, setComposeShowCc] = useState(false);
  const [composeShowBcc, setComposeShowBcc] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string>("");
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [inlineImagesByCid, setInlineImagesByCid] = useState<Record<string, File>>({});

  const sendMenuRef = useRef<HTMLDivElement | null>(null);
  const attachmentsInputRef = useRef<HTMLInputElement | null>(null);
  const scheduledForInputRef = useRef<HTMLInputElement | null>(null);

  const hasDraft = useMemo(() => composeMinimized, [composeMinimized]);

  const isComposeDirty = useMemo(() => {
    if (composeDraft.to.trim() !== "") return true;
    if (composeDraft.cc.trim() !== "") return true;
    if (composeDraft.bcc.trim() !== "") return true;
    if (composeDraft.subject.trim() !== "") return true;
    if (composeDraft.body.trim() !== "") return true;
    if (attachments.length > 0) return true;
    if (scheduleEnabled) return true;
    return false;
  }, [attachments.length, composeDraft, scheduleEnabled]);

  const inlineImagesForCurrentHtml = useCallback((): Array<{ cid: string; file: File }> => {
    const html = composeDraft.body || "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    const cids = Array.from(doc.querySelectorAll("img[data-cid]"))
      .map((img) => img.getAttribute("data-cid"))
      .filter((cid): cid is string => typeof cid === "string" && cid.trim() !== "");
    const unique = Array.from(new Set(cids));
    return unique
      .map((cid) => ({ cid, file: inlineImagesByCid[cid] }))
      .filter((x): x is { cid: string; file: File } => x.file instanceof File);
  }, [composeDraft.body, inlineImagesByCid]);

  const beginCompose = useCallback((draft?: Partial<ComposeDraft>) => {
    setComposeError(null);
    setComposeBusy(false);
    setComposeDraftEmailId(null);
    const inferredFrom = (() => {
      const username = auth?.authHeader ? decodeBasicUsername(auth.authHeader) : null;
      if (username && username.includes("@")) return username;
      const acctName = auth?.session.accounts?.[auth.accountId]?.name ?? "";
      return typeof acctName === "string" && acctName.includes("@") ? acctName : "";
    })();
    const cc = draft?.cc ?? "";
    const bcc = draft?.bcc ?? "";
    setComposeDraft({
      from: draft?.from ?? inferredFrom,
      to: draft?.to ?? "",
      cc,
      bcc,
      subject: draft?.subject ?? "",
      body: draft?.body ? plainTextToHtml(draft.body) : ""
    });
    setComposeShowCc(cc.trim() !== "");
    setComposeShowBcc(bcc.trim() !== "");
    setScheduleEnabled(false);
    setScheduledFor("");
    setSendMenuOpen(false);
    setComposeCancelConfirmOpen(false);
    setAttachments([]);
    setInlineImagesByCid({});
    setComposeMinimized(false);
    setComposeOpen(true);
  }, [auth]);

  const resumeCompose = useCallback(() => {
    setSendMenuOpen(false);
    setComposeCancelConfirmOpen(false);
    setComposeMinimized(false);
    setComposeOpen(true);
  }, []);

  const minimizeCompose = useCallback(() => {
    setComposeOpen(false);
    setSendMenuOpen(false);
    setComposeCancelConfirmOpen(false);
    if (isComposeDirty) setComposeMinimized(true);
  }, [isComposeDirty]);

  const discardCompose = useCallback(() => {
    setComposeOpen(false);
    setSendMenuOpen(false);
    setComposeCancelConfirmOpen(false);
    setComposeMinimized(false);
    setComposeBusy(false);
    setComposeError(null);
    setComposeDraftEmailId(null);
    setComposeDraft({ from: "", to: "", cc: "", bcc: "", subject: "", body: "" });
    setComposeShowCc(false);
    setComposeShowBcc(false);
    setScheduleEnabled(false);
    setScheduledFor("");
    setAttachments([]);
    setInlineImagesByCid({});
  }, []);

  const saveDraftToServer = useCallback(async () => {
    if (!auth) return;
    if (composeBusy) return;
    setComposeError(null);
    setComposeBusy(true);
    try {
      const draftsId =
        mailboxes.find((m) => (m.role ?? "").toLowerCase() === "drafts")?.id ??
        (await getDraftsMailboxId({ apiUrl: auth.session.apiUrl, authHeader: auth.authHeader, accountId: auth.accountId }));

      const res = await upsertDraftEmail({
        session: auth.session,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        draftsMailboxId: draftsId,
        from: composeDraft.from,
        to: composeDraft.to,
        cc: composeDraft.cc,
        bcc: composeDraft.bcc,
        subject: composeDraft.subject,
        htmlBody: composeDraft.body,
        attachments,
        inlineImages: inlineImagesForCurrentHtml(),
        emailId: composeDraftEmailId
      });

      setComposeDraftEmailId(res.emailId);
      setComposeMinimized(true);
      clearEmailListCacheForAccount({ apiUrl: auth.session.apiUrl, accountId: auth.accountId });
      void loadMailboxes({ force: true });
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setComposeBusy(false);
    }
  }, [auth, attachments, composeBusy, composeDraft, composeDraftEmailId, inlineImagesForCurrentHtml, loadMailboxes, mailboxes]);

  const sendComposeToServer = useCallback(async () => {
    if (!auth) return;
    if (composeBusy) return;
    setComposeError(null);

    if (composeDraft.from.trim() === "") {
      setComposeError("From address is required.");
      return;
    }
    if (composeDraft.to.trim() === "" && composeDraft.cc.trim() === "" && composeDraft.bcc.trim() === "") {
      setComposeError("Recipient is required.");
      return;
    }
    if (scheduleEnabled && scheduledFor.trim() === "") {
      setComposeError("Please choose a schedule time.");
      return;
    }

    setComposeBusy(true);
    try {
      const submissionAccountId = getPrimarySubmissionAccountId(auth.session);
      if (!submissionAccountId) {
        throw new Error('JMAP session has no "submission" account (urn:ietf:params:jmap:submission)');
      }

      const draftsId =
        mailboxes.find((m) => (m.role ?? "").toLowerCase() === "drafts")?.id ??
        (await getDraftsMailboxId({ apiUrl: auth.session.apiUrl, authHeader: auth.authHeader, accountId: auth.accountId }));

      const sentId =
        mailboxes.find((m) => (m.role ?? "").toLowerCase() === "sent")?.id ??
        (await getSentMailboxId({ apiUrl: auth.session.apiUrl, authHeader: auth.authHeader, accountId: auth.accountId }));

      const identity = await getOrCreateIdentity({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: submissionAccountId,
        email: composeDraft.from,
        name: activeProfileName
      });

      const { emailId } = await upsertDraftEmail({
        session: auth.session,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        draftsMailboxId: draftsId,
        from: composeDraft.from,
        to: composeDraft.to,
        cc: composeDraft.cc,
        bcc: composeDraft.bcc,
        subject: composeDraft.subject,
        htmlBody: composeDraft.body,
        attachments,
        inlineImages: inlineImagesForCurrentHtml(),
        emailId: composeDraftEmailId
      });

      const sendAtDate = scheduleEnabled ? new Date(scheduledFor) : null;
      if (scheduleEnabled && (!sendAtDate || Number.isNaN(sendAtDate.getTime()))) {
        setComposeError("Invalid schedule time.");
        return;
      }
      const sendAt = sendAtDate ? sendAtDate.toISOString() : null;
      await sendEmailSubmission({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: submissionAccountId,
        identity,
        emailId,
        draftsMailboxId: draftsId,
        sentMailboxId: sentId,
        to: composeDraft.to,
        cc: composeDraft.cc,
        bcc: composeDraft.bcc,
        sendAt
      });

      discardCompose();
      clearEmailListCacheForAccount({ apiUrl: auth.session.apiUrl, accountId: auth.accountId });
      void loadMessages({ force: true });
      void loadMailboxes({ force: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send email";
      if (message.toLowerCase().includes("invalid e-mail address") || message.toLowerCase().includes("invalid email address")) {
        setComposeError(
          `${message} The "From" address must be a real mailbox/domain configured in Stalwart (create it in the admin UI).`
        );
      } else {
        setComposeError(message);
      }
    } finally {
      setComposeBusy(false);
    }
  }, [activeProfileName, attachments, auth, composeBusy, composeDraft, composeDraftEmailId, discardCompose, inlineImagesForCurrentHtml, loadMailboxes, loadMessages, mailboxes, scheduleEnabled, scheduledFor]);

  const openSchedulePicker = useCallback(() => {
    if (!scheduledFor) setScheduledFor(toDatetimeLocalValue(roundToNextMinutes(new Date(), 15)));
    setSendMenuOpen(false);
    window.requestAnimationFrame(() => scheduledForInputRef.current?.focus());
  }, [scheduledFor]);

  return {
    composeOpen,
    setComposeOpen,
    composeMinimized,
    composeCancelConfirmOpen,
    setComposeCancelConfirmOpen,
    composeBusy,
    composeError,
    composeDraft,
    setComposeDraft,
    composeShowCc,
    setComposeShowCc,
    composeShowBcc,
    setComposeShowBcc,
    scheduleEnabled,
    setScheduleEnabled,
    scheduledFor,
    setScheduledFor,
    sendMenuOpen,
    setSendMenuOpen,
    attachments,
    setAttachments,
    inlineImagesByCid,
    setInlineImagesByCid,
    sendMenuRef,
    attachmentsInputRef,
    scheduledForInputRef,
    hasDraft,
    isComposeDirty,
    beginCompose,
    resumeCompose,
    minimizeCompose,
    discardCompose,
    saveDraftToServer,
    sendComposeToServer,
    openSchedulePicker
  };
}

