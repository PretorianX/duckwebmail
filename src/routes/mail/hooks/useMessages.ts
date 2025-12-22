import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearEmailListCacheForAccount,
  getEmailBody,
  isStarred,
  isUnread,
  markEmailAsRead,
  markEmailAsUnread,
  setEmailStarred,
  destroyEmail,
  moveEmailToMailbox
} from "../../../jmap/email";
import { PaginationController } from "../../../jmap/PaginationController";
import { fetchBimiLogo, normalizeBimiDomainKey } from "../../../jmap/bimi";
import type { JmapSession } from "../../../jmap/normalizeSession";
import type { Attachment, Message } from "../types";
import { toMessage, buildJmapDownloadUrl, sanitizeFilename } from "../utils";
import { extractAttachmentsFromBodyStructure } from "../attachments";

type Auth = {
  session: JmapSession;
  authHeader: string;
  accountId: string;
} | null;

type UseMessagesParams = {
  auth: Auth;
  folderId: string;
  isDesktop: boolean;
  loadMailboxes: (opts?: { force?: boolean }) => Promise<void>;
};

export function useMessages({ auth, folderId, isDesktop, loadMailboxes }: UseMessagesParams) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIncludeBody, setSearchIncludeBody] = useState(false);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => new Set());
  const [expandedAttachmentIds, setExpandedAttachmentIds] = useState<Set<string>>(() => new Set());
  const [expandedToIds, setExpandedToIds] = useState<Set<string>>(() => new Set());
  const [bodyLoadingIds, setBodyLoadingIds] = useState<Set<string>>(() => new Set());
  const [bodyErrors, setBodyErrors] = useState<Record<string, string>>({});
  const [rowActionsMessageId, setRowActionsMessageId] = useState<string | null>(null);
  const [bimiLogos, setBimiLogos] = useState<Map<string, string | null>>(new Map());
  const [messageBodies, setMessageBodies] = useState<Map<string, { html?: string; text?: string }>>(new Map());
  const [messageAttachments, setMessageAttachments] = useState<Map<string, { attachments: Attachment[]; inlineImages: Attachment[] }>>(
    () => new Map()
  );
  const messageBodiesRef = useRef(messageBodies);
  const messageAttachmentsRef = useRef(messageAttachments);

  useEffect(() => {
    messageBodiesRef.current = messageBodies;
  }, [messageBodies]);

  useEffect(() => {
    messageAttachmentsRef.current = messageAttachments;
  }, [messageAttachments]);

  // Email drag state
  const [draggingEmailId, setDraggingEmailId] = useState<string | null>(null);
  const [draggingEmailFromFolderId, setDraggingEmailFromFolderId] = useState<string | null>(null);

  // Pagination controller
  const controllerRef = useRef<PaginationController | null>(null);
  const [controllerState, setControllerState] = useState<ReturnType<PaginationController["getState"]>>(null);
  const folderIdRef = useRef(folderId);

  const syncControllerState = useCallback(() => {
    if (!controllerRef.current) {
      setControllerState(null);
      return;
    }
    setControllerState(controllerRef.current.getState());
  }, []);

  // Convert controller state to Message[]
  const messages = useMemo(() => {
    if (!controllerState) return [];
    return controllerState.ids.map((id) => {
      const item = controllerState.itemsById.get(id);
      if (!item) return null;
      const body = messageBodies.get(id);
      const extracted = messageAttachments.get(id);
      const msg = toMessage(item);
      if (body) {
        msg.html = body.html;
        msg.text = body.text;
      }
      if (extracted) {
        msg.attachments = extracted.attachments;
        msg.inlineImages = extracted.inlineImages;
      }
      return msg;
    }).filter((m): m is Message => m !== null);
  }, [controllerState, messageBodies, messageAttachments]);

  const messagesLoading = controllerState?.loading ?? false;
  const messagesError = controllerState?.error ?? null;

  // Get row actions message
  const rowActionsMessage = useMemo(() => {
    if (!rowActionsMessageId || !controllerState) return null;
    const item = controllerState.itemsById.get(rowActionsMessageId);
    if (!item) return null;
    const body = messageBodies.get(rowActionsMessageId);
    const extracted = messageAttachments.get(rowActionsMessageId);
    const msg = toMessage(item);
    if (body) {
      msg.html = body.html;
      msg.text = body.text;
    }
    if (extracted) {
      msg.attachments = extracted.attachments;
      msg.inlineImages = extracted.inlineImages;
    }
    return msg;
  }, [controllerState, rowActionsMessageId, messageBodies, messageAttachments]);

  // Initialize controller when auth changes
  useEffect(() => {
    if (!auth) {
      controllerRef.current = null;
      setControllerState(null);
      return;
    }

    const pageSize = isDesktop ? 50 : 30;
    controllerRef.current = new PaginationController({
      apiUrl: auth.session.apiUrl,
      authHeader: auth.authHeader,
      accountId: auth.accountId,
      pageSize,
      query: searchQuery.trim() || undefined,
      includeBody: searchIncludeBody,
      debug: true
    });

    return () => {
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.accountId, auth?.authHeader, auth?.session.apiUrl, isDesktop, searchQuery, searchIncludeBody]);

  // Update folder ref
  useEffect(() => {
    folderIdRef.current = folderId;
  }, [folderId]);

  // Load messages
  const loadMessages = useCallback(async (opts?: { force?: boolean; query?: string; includeBody?: boolean }) => {
    if (!auth) return;
    if (!folderId) return;

    const q = opts?.query ?? searchQuery;
    const body = opts?.includeBody ?? searchIncludeBody;

    // Recreate controller if query params changed
    const pageSize = isDesktop ? 50 : 30;
    controllerRef.current = new PaginationController({
      apiUrl: auth.session.apiUrl,
      authHeader: auth.authHeader,
      accountId: auth.accountId,
      pageSize,
      query: q.trim() || undefined,
      includeBody: body,
      debug: true
    });

    try {
      await controllerRef.current.initQuery(folderId);
      syncControllerState();

      // Fetch BIMI logos for loaded messages
      const state = controllerRef.current.getState();
      if (state) {
        const senderDomains = new Set<string>();
        for (const id of state.ids.slice(0, 50)) {
          const item = state.itemsById.get(id);
          if (item) {
            const senderEmail = item.from?.[0]?.email;
            const domain = senderEmail ? normalizeBimiDomainKey(senderEmail) : null;
            if (domain) senderDomains.add(domain);
          }
        }

        const logoPromises = Array.from(senderDomains).map(async (domain) => {
          const logoUrl = await fetchBimiLogo(domain);
          return { domain, logoUrl };
        });

        const logoResults = await Promise.all(logoPromises);
        setBimiLogos((prev) => {
          const next = new Map(prev);
          for (const { domain, logoUrl } of logoResults) {
            next.set(domain, logoUrl);
          }
          return next;
        });
      }
    } catch (err) {
      syncControllerState();
      console.error("Failed to load messages:", err);
    }
  }, [auth, folderId, isDesktop, searchIncludeBody, searchQuery, syncControllerState]);

  // Reset on folder change
  useEffect(() => {
    setExpandedMessageIds(new Set());
    setExpandedAttachmentIds(new Set());
    setExpandedToIds(new Set());
    setDraggingEmailId(null);
    setDraggingEmailFromFolderId(null);
    setMessageAttachments(new Map());
  }, [folderId]);

  // Load messages when folder changes
  useEffect(() => {
    if (!auth) {
      setControllerState(null);
      return;
    }
    if (!folderId) {
      if (controllerRef.current) controllerRef.current.reset(null);
      setControllerState(null);
      setBodyErrors({});
      setBodyLoadingIds(new Set());
      return;
    }
    if (controllerRef.current) controllerRef.current.reset(folderId);
    void loadMessages({ force: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.accountId, auth?.authHeader, auth?.session.apiUrl, folderId, loadMessages]);

  // Debounced search
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!auth) return;
    if (!folderId) return;

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }

    searchTimeoutRef.current = setTimeout(() => {
      void loadMessages({ force: true, query: searchQuery, includeBody: searchIncludeBody });
    }, 250);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, [auth, folderId, loadMessages, searchIncludeBody, searchQuery]);

  // Resolve CID images to object URLs
  const resolveCidImagesToObjectUrls = useCallback(async (
    html: string,
    bodyStructure: unknown | undefined
  ): Promise<{ html: string; objectUrls: string[] }> => {
    if (!auth) return { html, objectUrls: [] };
    if (!html || html.trim() === "") return { html, objectUrls: [] };

    type Part = {
      blobId?: string;
      cid?: string;
      type?: string;
      name?: string;
      subParts?: Part[];
    };

    const normalizeCid = (cid: string) => cid.trim().replace(/^<|>$/g, "");

    const cidToPart = new Map<string, Part>();
    const walk = (p: Part | undefined) => {
      if (!p) return;
      if (typeof p.cid === "string" && typeof p.blobId === "string") {
        const k = normalizeCid(p.cid);
        if (k) cidToPart.set(k, p);
      }
      for (const sp of p.subParts ?? []) walk(sp);
    };
    walk(bodyStructure as Part | undefined);

    if (cidToPart.size === 0) return { html, objectUrls: [] };

    const doc = new DOMParser().parseFromString(html, "text/html");
    const imgs = Array.from(doc.querySelectorAll("img"));

    const objectUrls: string[] = [];
    const cidInUse = new Map<string, HTMLImageElement[]>();

    for (const img of imgs) {
      const src = img.getAttribute("src") ?? "";
      if (!src.toLowerCase().startsWith("cid:")) continue;
      const cid = normalizeCid(src.slice(4));
      if (!cid) continue;
      const list = cidInUse.get(cid) ?? [];
      list.push(img);
      cidInUse.set(cid, list);
    }

    for (const [cid, targets] of cidInUse.entries()) {
      const part = cidToPart.get(cid);
      if (!part?.blobId) continue;
      const type = typeof part.type === "string" && part.type.trim() ? part.type : "application/octet-stream";
      const name =
        typeof part.name === "string" && part.name.trim()
          ? part.name
          : type.startsWith("image/")
            ? `inline-${cid}.${type.split("/")[1] ?? "img"}`
            : `inline-${cid}`;
      const url = buildJmapDownloadUrl(auth.session.downloadUrl, {
        accountId: auth.accountId,
        blobId: part.blobId,
        name,
        type
      });

      const res = await fetch(url, { headers: { Authorization: auth.authHeader } });
      if (!res.ok) continue;
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      objectUrls.push(objectUrl);
      for (const img of targets) img.setAttribute("src", objectUrl);
    }

    return { html: doc.body.innerHTML, objectUrls };
  }, [auth]);

  // Toggle message expansion
  const toggleExpanded = useCallback((messageId: string) => {
    const ensureBodyLoaded = async (targetMessageId: string) => {
      if (!auth) return;
      if (messageBodiesRef.current.has(targetMessageId) && messageAttachmentsRef.current.has(targetMessageId)) return;
      setBodyErrors((prev) => {
        if (!prev[targetMessageId]) return prev;
        const next = { ...prev };
        delete next[targetMessageId];
        return next;
      });
      setBodyLoadingIds((prev) => {
        if (prev.has(targetMessageId)) return prev;
        const next = new Set(prev);
        next.add(targetMessageId);
        return next;
      });

      try {
        const body = await getEmailBody({
          apiUrl: auth.session.apiUrl,
          authHeader: auth.authHeader,
          accountId: auth.accountId,
          emailId: targetMessageId
        });
        const resolved = body.html
          ? await resolveCidImagesToObjectUrls(body.html, body.bodyStructure)
          : { html: body.html ?? "", objectUrls: [] };

        const extracted = extractAttachmentsFromBodyStructure(body.bodyStructure);
        setMessageBodies((prev) => {
          const next = new Map(prev);
          next.set(targetMessageId, { html: resolved.html || undefined, text: body.text });
          return next;
        });
        setMessageAttachments((prev) => {
          const next = new Map(prev);
          next.set(targetMessageId, extracted);
          return next;
        });
      } catch (err) {
        setBodyErrors((prev) => ({
          ...prev,
          [targetMessageId]: err instanceof Error ? err.message : "Failed to load message body"
        }));
      } finally {
        setBodyLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(targetMessageId);
          return next;
        });
      }
    };

    const markAsReadIfNeeded = async (targetMessageId: string) => {
      if (!auth) return;
      if (!controllerRef.current) return;

      const state = controllerRef.current.getState();
      const item = state?.itemsById.get(targetMessageId);
      if (!item || !isUnread(item.keywords)) return;

      controllerRef.current.updateItem(targetMessageId, (email) => ({
        ...email,
        keywords: { ...email.keywords, "$seen": true }
      }));
      syncControllerState();

      const success = await markEmailAsRead({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        emailId: targetMessageId
      });

      if (success) {
        void loadMailboxes({ force: true });
      } else {
        controllerRef.current.updateItem(targetMessageId, (email) => {
          const keywords = { ...email.keywords };
          delete keywords["$seen"];
          return { ...email, keywords };
        });
        syncControllerState();
      }
    };

    const wasOpen = expandedMessageIds.has(messageId);
    setExpandedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });

    if (!wasOpen) {
      void ensureBodyLoaded(messageId);
      void markAsReadIfNeeded(messageId);
    }
  }, [auth, expandedMessageIds, loadMailboxes, resolveCidImagesToObjectUrls, syncControllerState]);

  const toggleAttachments = useCallback((messageId: string) => {
    setExpandedAttachmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const toggleStar = useCallback((messageId: string) => {
    const run = async () => {
      if (!auth) return;
      if (!controllerRef.current) return;

      const state = controllerRef.current.getState();
      const item = state?.itemsById.get(messageId);
      if (!item) return;
      const nextStarred = !isStarred(item.keywords);

      controllerRef.current.updateItem(messageId, (email) => {
        const keywords = { ...email.keywords };
        if (nextStarred) {
          keywords["$flagged"] = true;
        } else {
          delete keywords["$flagged"];
        }
        return { ...email, keywords };
      });
      syncControllerState();

      const ok = await setEmailStarred({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        emailId: messageId,
        starred: nextStarred
      });

      if (!ok) {
        controllerRef.current.updateItem(messageId, (email) => {
          const keywords = { ...email.keywords };
          if (nextStarred) delete keywords["$flagged"];
          else keywords["$flagged"] = true;
          return { ...email, keywords };
        });
        syncControllerState();
      }
    };
    void run();
  }, [auth, syncControllerState]);

  const toggleUnread = useCallback((messageId: string) => {
    const run = async () => {
      if (!auth) return;
      if (!controllerRef.current) return;

      const state = controllerRef.current.getState();
      const item = state?.itemsById.get(messageId);
      if (!item) return;
      const nextUnread = !isUnread(item.keywords);

      controllerRef.current.updateItem(messageId, (email) => {
        const keywords = { ...email.keywords };
        if (nextUnread) delete keywords["$seen"];
        else keywords["$seen"] = true;
        return { ...email, keywords };
      });
      syncControllerState();

      const ok = nextUnread
        ? await markEmailAsUnread({
            apiUrl: auth.session.apiUrl,
            authHeader: auth.authHeader,
            accountId: auth.accountId,
            emailId: messageId
          })
        : await markEmailAsRead({
            apiUrl: auth.session.apiUrl,
            authHeader: auth.authHeader,
            accountId: auth.accountId,
            emailId: messageId
          });

      if (!ok) {
        controllerRef.current.updateItem(messageId, (email) => {
          const keywords = { ...email.keywords };
          if (nextUnread) keywords["$seen"] = true;
          else delete keywords["$seen"];
          return { ...email, keywords };
        });
        syncControllerState();
        return;
      }

      clearEmailListCacheForAccount({ apiUrl: auth.session.apiUrl, accountId: auth.accountId });
      void loadMailboxes({ force: true });
    };
    void run();
  }, [auth, loadMailboxes, syncControllerState]);

  const fetchAttachmentBlob = useCallback(async (a: Attachment): Promise<{ blob: Blob; filename: string }> => {
    if (!auth) throw new Error("Not authenticated");
    const filename = sanitizeFilename(a.name || "attachment");
    const url = buildJmapDownloadUrl(auth.session.downloadUrl, {
      accountId: auth.accountId,
      blobId: a.blobId,
      name: filename,
      type: a.contentType || "application/octet-stream"
    });
    const res = await fetch(url, { method: "GET", headers: { Authorization: auth.authHeader } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return { blob: await res.blob(), filename };
  }, [auth]);

  const deleteMessage = useCallback((messageId: string) => {
    const run = async () => {
      if (!auth) return;
      if (!controllerRef.current) return;

      const state = controllerRef.current.getState();
      const item = state?.itemsById.get(messageId);
      if (!item) return;

      // Optimistic removal
      controllerRef.current.removeItem(messageId);
      syncControllerState();
      setExpandedMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      setMessageAttachments((prev) => {
        if (!prev.has(messageId)) return prev;
        const next = new Map(prev);
        next.delete(messageId);
        return next;
      });
      setRowActionsMessageId((prev) => (prev === messageId ? null : prev));

      const ok = await destroyEmail({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        emailId: messageId
      });

      if (!ok) {
        // Reload on failure
        void loadMessages({ force: true });
        return;
      }

      clearEmailListCacheForAccount({ apiUrl: auth.session.apiUrl, accountId: auth.accountId });
      void loadMailboxes({ force: true });
    };
    void run();
  }, [auth, loadMailboxes, loadMessages, syncControllerState]);

  const performMoveEmail = useCallback(async (params: { emailId: string; fromFolderId: string; toFolderId: string }) => {
    if (!auth) return;
    if (params.fromFolderId === params.toFolderId) return;
    try {
      await moveEmailToMailbox({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        emailId: params.emailId,
        fromMailboxId: params.fromFolderId,
        toMailboxId: params.toFolderId
      });

      if (folderIdRef.current === params.fromFolderId && controllerRef.current) {
        controllerRef.current.removeItem(params.emailId);
        syncControllerState();
        setExpandedMessageIds((prev) => {
          if (!prev.has(params.emailId)) return prev;
          const next = new Set(prev);
          next.delete(params.emailId);
          return next;
        });
        setExpandedAttachmentIds((prev) => {
          const next = new Set(prev);
          next.delete(params.emailId);
          return next;
        });
        setExpandedToIds((prev) => {
          const next = new Set(prev);
          next.delete(params.emailId);
          return next;
        });
        setMessageAttachments((prev) => {
          if (!prev.has(params.emailId)) return prev;
          const next = new Map(prev);
          next.delete(params.emailId);
          return next;
        });
      }

      void loadMailboxes({ force: true });
    } catch (err) {
      console.error("Failed to move email:", err);
    }
  }, [auth, loadMailboxes, syncControllerState]);

  const loadNextPage = useCallback(async () => {
    if (!controllerRef.current) return;
    await controllerRef.current.loadNextPage();
    syncControllerState();
  }, [syncControllerState]);

  const applyPendingNewMessages = useCallback((firstVisibleId: string | null) => {
    if (!controllerRef.current) return;
    controllerRef.current.applyPendingNewMessages(firstVisibleId);
    syncControllerState();
  }, [syncControllerState]);

  const refreshHead = useCallback(async () => {
    if (!controllerRef.current) return;
    await controllerRef.current.refreshHead();
    syncControllerState();
  }, [syncControllerState]);

  return {
    messages,
    messagesLoading,
    messagesError,
    controllerState,
    controllerRef,
    folderIdRef,
    searchQuery,
    setSearchQuery,
    searchIncludeBody,
    setSearchIncludeBody,
    expandedMessageIds,
    setExpandedMessageIds,
    expandedAttachmentIds,
    expandedToIds,
    setExpandedToIds,
    bodyLoadingIds,
    bodyErrors,
    rowActionsMessageId,
    setRowActionsMessageId,
    rowActionsMessage,
    bimiLogos,
    messageBodies,
    draggingEmailId,
    setDraggingEmailId,
    draggingEmailFromFolderId,
    setDraggingEmailFromFolderId,
    loadMessages,
    toggleExpanded,
    toggleAttachments,
    toggleStar,
    toggleUnread,
    deleteMessage,
    performMoveEmail,
    fetchAttachmentBlob,
    loadNextPage,
    applyPendingNewMessages,
    refreshHead,
    syncControllerState
  };
}

