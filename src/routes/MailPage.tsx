import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { VariableSizeList } from "react-window";
import {
  ChevronDown,
  FileText,
  LoaderCircle,
  Pencil
} from "lucide-react";
import { useTranslation } from "react-i18next";

import ProfileMenu from "../shared/ProfileMenu";
import { useMediaQuery } from "../shared/useMediaQuery";
import { useAuth } from "../auth/AuthContext";
import { formatQuotaBytes } from "../jmap/quota";

import {
  useMailboxes,
  useQuotas,
  useMessages,
  useFolderOperations,
  useCompose,
  useWebSocketPush
} from "./mail/hooks";
import {
  FolderTree,
  MessageRow,
  ComposeModal,
  MessageActionsSheet,
  AttachmentActionsSheet,
  FolderActionsSheet,
  FolderOperationModal
} from "./mail/components";
import { decodeBasicUsername, sanitizeFilename, buildJmapDownloadUrl, triggerBlobDownload } from "./mail/utils";
import type { Attachment, Message } from "./mail/types";
import { getDeployEnv } from "../config/deployEnv";

import styles from "./mail.module.css";

const branding = getDeployEnv("VITE_LOGIN_BRANDING")?.trim() || "Duckmail";

export default function MailPage() {
  const { t } = useTranslation();
  const { activeAuth: auth, activeProfile } = useAuth();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const isDenseDesktop = useMediaQuery("(min-width: 1024px)");

  // Drag capabilities
  const [canDragFolders, setCanDragFolders] = useState(false);
  const canDragEmails = canDragFolders;

  useEffect(() => {
    const media = window.matchMedia("(pointer: fine) and (hover: hover)");
    const apply = () => setCanDragFolders(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  // UI State
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [activeAttachment, setActiveAttachment] = useState<Attachment | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<{ url: string; name: string } | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);

  // Virtual list refs
  const virtualListRef = useRef<VariableSizeList | null>(null);
  const rowHeightsRef = useRef<Map<string, number>>(new Map());
  const rowResizeObserversRef = useRef<Map<string, ResizeObserver>>(new Map());
  const rowGroupRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const defaultRowHeight = isDenseDesktop ? 43 : isDesktop ? 48 : 56;

  const resetRafRef = useRef(0);
  const resetMinIndexRef = useRef(Infinity);
  const scheduleVirtualListReset = useCallback((index: number) => {
    resetMinIndexRef.current = Math.min(resetMinIndexRef.current, index);
    if (resetRafRef.current) return;
    resetRafRef.current = window.requestAnimationFrame(() => {
      resetRafRef.current = 0;
      const idx = resetMinIndexRef.current;
      resetMinIndexRef.current = Infinity;
      virtualListRef.current?.resetAfterIndex(idx);
    });
  }, []);

  // Hooks
  const mailboxHook = useMailboxes(auth);
  const quotaHook = useQuotas(auth);
  const messageHook = useMessages({
    auth: auth as Parameters<typeof useMessages>[0]["auth"],
    folderId: mailboxHook.folderId,
    isDesktop,
    loadMailboxes: mailboxHook.loadMailboxes
  });
  const folderOpsHook = useFolderOperations({
    auth,
    folderIndex: mailboxHook.folderIndex,
    mailboxById: mailboxHook.mailboxById,
    setFolderId: mailboxHook.setFolderId,
    setOpenFolderIds: mailboxHook.setOpenFolderIds,
    loadMailboxes: mailboxHook.loadMailboxes
  });
  const composeHook = useCompose({
    auth: auth as Parameters<typeof useCompose>[0]["auth"],
    mailboxes: mailboxHook.mailboxes,
    activeProfileName: activeProfile.name,
    loadMessages: messageHook.loadMessages,
    loadMailboxes: mailboxHook.loadMailboxes
  });

  useWebSocketPush({
    auth: auth as Parameters<typeof useWebSocketPush>[0]["auth"],
    folderIdRef: messageHook.folderIdRef,
    loadMailboxes: mailboxHook.loadMailboxes,
    refreshHead: messageHook.refreshHead
  });

  // Reset virtual list on expand/collapse
  useLayoutEffect(() => {
    virtualListRef.current?.resetAfterIndex(0);
  }, [messageHook.expandedMessageIds, isDenseDesktop]);

  // Close folder picker when folder changes
  useEffect(() => {
    setFolderPickerOpen(false);
  }, [mailboxHook.folderId]);

  // Folder-switch loader overlay (keep existing list visible, but blurred, until the new folder finishes loading)
  const [folderSwitching, setFolderSwitching] = useState(false);
  const folderSwitchTargetIdRef = useRef<string | null>(null);

  const setFolderIdWithOverlay = useCallback((id: string) => {
    if (!id) return;
    if (id === mailboxHook.folderId) return;
    folderSwitchTargetIdRef.current = id;
    setFolderSwitching(true);
    mailboxHook.setFolderId(id);
  }, [mailboxHook]);

  useEffect(() => {
    if (!folderSwitching) return;
    const targetId = folderSwitchTargetIdRef.current;
    const state = messageHook.controllerState;
    if (!targetId) return;
    if (!state) return;
    if (state.mailboxId !== targetId) return;
    if (state.loading) return;
    // Loaded (or errored) for the target folder → remove blur + overlay.
    setFolderSwitching(false);
    folderSwitchTargetIdRef.current = null;
  }, [folderSwitching, messageHook.controllerState]);

  // Close send menu on outside click
  useEffect(() => {
    if (!composeHook.sendMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = composeHook.sendMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      composeHook.setSendMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeHook.sendMenuOpen, composeHook.sendMenuRef, composeHook.setSendMenuOpen]);

  // Download EML
  const downloadEml = async (m: Message) => {
    if (!auth) return;
    if (!m.blobId) return;
    const filename = `${sanitizeFilename(m.subject)}.eml`;
    const url = buildJmapDownloadUrl(auth.session.downloadUrl, {
      accountId: auth.accountId,
      blobId: m.blobId,
      name: filename,
      type: "message/rfc822"
    });
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: auth.authHeader }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const blob = await res.blob();
      triggerBlobDownload(filename, blob);
    } catch (e) {
      console.error("[EmlDownload] failed:", e);
      globalThis.alert(t("mail.downloadEmlFailed"));
    }
  };

  const previewAttachment = async (a: Attachment) => {
    try {
      const { blob, filename } = await messageHook.fetchAttachmentBlob(a);
      const objectUrl = URL.createObjectURL(blob);

      // Image preview in-app; everything else in a new tab.
      if ((a.contentType || "").toLowerCase().startsWith("image/")) {
        if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = objectUrl;
        setAttachmentPreview({ url: objectUrl, name: filename });
        return;
      }

      const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
      // If blocked, be explicit rather than silently doing something else.
      if (!opened) globalThis.alert(t("mail.previewBlocked"));

      // Give the new tab time to load the blob URL before revoking.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (e) {
      console.error("[AttachmentPreview] failed:", e);
      globalThis.alert(t("mail.attachmentPreviewFailed"));
    }
  };

  const downloadAttachment = async (a: Attachment) => {
    try {
      const { blob, filename } = await messageHook.fetchAttachmentBlob(a);
      triggerBlobDownload(filename, blob);
    } catch (e) {
      console.error("[AttachmentDownload] failed:", e);
      globalThis.alert(t("mail.downloadAttachmentFailed"));
    }
  };

  const { messages, controllerState } = messageHook;
  const showFolderSwitchOverlay = folderSwitching && !!folderSwitchTargetIdRef.current;

  return (
    <main className={styles.shell}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLogo}>
          <span className={styles.headerDuck} aria-hidden="true">🦆</span>
          <span className={styles.headerBrand}>{branding}</span>
        </div>
        <div className={styles.headerSearch}>
          <label className={styles.searchLabel}>
            <span className={styles.srOnly}>{t("mail.search")}</span>
            <input
              className={styles.search}
              placeholder={t("mail.searchPlaceholder")}
              value={messageHook.searchQuery}
              onChange={(e) => messageHook.setSearchQuery(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={`${styles.searchBodyToggle} ${messageHook.searchIncludeBody ? styles.searchBodyToggleActive : ""}`}
            title={t(messageHook.searchIncludeBody ? "mail.searchingMessageTextDisable" : "mail.searchMessageText")}
            onClick={() => messageHook.setSearchIncludeBody((prev) => !prev)}
          >
            <FileText className={styles.icon} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.headerActions}>
          {auth && (() => {
            const signedInEmail = decodeBasicUsername(auth.authHeader);
            if (!signedInEmail) return null;
            return (
              <button
                type="button"
                className={styles.headerEmail}
                title={t("mail.clickToCopyEmail")}
                onClick={() => {
                  void globalThis.navigator?.clipboard?.writeText(signedInEmail);
                  setEmailCopied(true);
                  setTimeout(() => setEmailCopied(false), 1500);
                }}
              >
                {emailCopied ? t("mail.copiedToClipboard") : signedInEmail}
              </button>
            );
          })()}
          <ProfileMenu />
        </div>
      </header>

      {/* Sidebar */}
      <aside className={styles.sidebar} aria-label={t("mail.folders")}>
        <nav className={styles.folders} aria-label={t("mail.folders")}>
          <div className={styles.folderFilterRow}>
            <label className={styles.folderFilterLabel}>
              <span className={styles.srOnly}>{t("mail.findFolder")}</span>
              <input
                className={styles.folderFilter}
                value={mailboxHook.folderQuery}
                placeholder={t("mail.findFolderPlaceholder")}
                onChange={(e) => mailboxHook.setFolderQuery(e.target.value)}
              />
            </label>
          </div>

          {folderOpsHook.folderUiError && (
            <div className={styles.errorState} role="alert">
              {folderOpsHook.folderUiError}
            </div>
          )}

          {mailboxHook.mailboxesLoading ? (
            <div className={styles.loadingState} aria-live="polite">
              <LoaderCircle className={`${styles.icon} ${styles.spinner}`} aria-hidden="true" />
              {t("mail.loadingFolders")}
            </div>
          ) : mailboxHook.mailboxesError ? (
            <div className={styles.errorState} role="alert">
              {mailboxHook.mailboxesError}{" "}
              <button type="button" className={styles.secondaryButton} onClick={() => void mailboxHook.loadMailboxes({ force: true })}>
                {t("common.retry")}
              </button>
            </div>
          ) : (
            <FolderTree
              folders={mailboxHook.folders}
              folderIndex={mailboxHook.folderIndex}
              mailboxById={mailboxHook.mailboxById}
              folderId={mailboxHook.folderId}
              setFolderId={setFolderIdWithOverlay}
              effectiveOpenFolderIds={mailboxHook.effectiveOpenFolderIds}
              visibleFolderIds={mailboxHook.visibleFolderIds}
              toggleFolderOpen={mailboxHook.toggleFolderOpen}
              canDragFolders={canDragFolders}
              canDragEmails={canDragEmails}
              draggingFolderId={folderOpsHook.draggingFolderId}
              setDraggingFolderId={folderOpsHook.setDraggingFolderId}
              dropTargetFolderId={folderOpsHook.dropTargetFolderId}
              setDropTargetFolderId={folderOpsHook.setDropTargetFolderId}
              draggingEmailId={messageHook.draggingEmailId}
              draggingEmailFromFolderId={messageHook.draggingEmailFromFolderId}
              setDraggingEmailId={messageHook.setDraggingEmailId}
              setDraggingEmailFromFolderId={messageHook.setDraggingEmailFromFolderId}
              performMoveFolder={folderOpsHook.performMoveFolder}
              performMoveEmail={messageHook.performMoveEmail}
              setFolderActionsFolderId={folderOpsHook.setFolderActionsFolderId}
              folderIdRef={messageHook.folderIdRef}
            />
          )}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            className={styles.sidebarCompose}
            type="button"
            onClick={() => {
              if (composeHook.composeMinimized) composeHook.resumeCompose();
              else composeHook.beginCompose({ to: "", subject: "", body: "" });
            }}
          >
            <Pencil className={styles.icon} aria-hidden="true" />
            <span>{t("mail.compose")}</span>
            {composeHook.hasDraft && <span className={styles.sidebarDraftPill}>1</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <section className={styles.content}>
        <div className={styles.mobileTopbar}>
          <button
            type="button"
            className={styles.folderSwitcher}
            onClick={() => setFolderPickerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={folderPickerOpen}
            title={t("mail.changeFolder")}
          >
            <span className={styles.folderSwitcherDuck} aria-hidden="true">🦆</span>
            <span className={styles.folderSwitcherName}>{mailboxHook.folder.name}</span>
            <span className={styles.count}>({controllerState?.ids.length ?? 0})</span>
            <ChevronDown className={`${styles.icon} ${styles.folderSwitcherChevron}`} aria-hidden="true" />
          </button>
          <ProfileMenu />
        </div>

        <section
          className={styles.list}
          aria-label={t("mail.messageList")}
          style={{ position: "relative", height: "100%", overflow: "hidden" }}
        >
          <div className={`${styles.messageListContent} ${showFolderSwitchOverlay ? styles.messageListContentBlurred : ""}`}>
          {controllerState?.pendingNewCount && controllerState.pendingNewCount > 0 ? (
            <div style={{ padding: "8px", textAlign: "center" }}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  const firstVisibleId = controllerState?.ids[0] ?? null;
                  messageHook.applyPendingNewMessages(firstVisibleId);
                  if (virtualListRef.current && firstVisibleId) {
                    const index = controllerState?.ids.indexOf(firstVisibleId) ?? 0;
                    virtualListRef.current.scrollToItem(index, "start");
                  }
                }}
              >
                {t("mail.newMessages", { count: controllerState.pendingNewCount })}
              </button>
            </div>
          ) : null}

          {messageHook.messagesLoading && messages.length === 0 ? (
            <div className={styles.loadingState} aria-live="polite">
              <LoaderCircle className={`${styles.icon} ${styles.spinner}`} aria-hidden="true" />
              {messageHook.searchQuery.trim() ? t("mail.searching") : t("mail.loadingEmails")}
            </div>
          ) : messageHook.messagesError ? (
            <div className={styles.errorState} role="alert">
              {messageHook.messagesError}{" "}
              <button type="button" className={styles.secondaryButton} onClick={() => void messageHook.loadMessages({ force: true })}>
                {t("common.retry")}
              </button>
            </div>
          ) : messages.length === 0 && !messageHook.messagesLoading ? (
            <div className={styles.emptyState}>
              {messageHook.searchQuery.trim()
                ? t("mail.noResultsForQuery", { query: messageHook.searchQuery.trim() })
                : t("mail.noEmailsInFolder")}
            </div>
          ) : messages.length > 0 ? (
            <VariableSizeList
              ref={virtualListRef}
              height={isDesktop ? window.innerHeight - 150 : window.innerHeight - 200}
              itemCount={messages.length + (controllerState?.hasMore ? 1 : 0)}
              itemSize={(index) => {
                if (index >= messages.length) return 60;
                const msg = messages[index];
                const isOpen = messageHook.expandedMessageIds.has(msg.id);
                const cachedHeight = rowHeightsRef.current.get(msg.id);
                if (cachedHeight) return cachedHeight;
                return isOpen ? 360 : defaultRowHeight;
              }}
              width="100%"
              onItemsRendered={({ visibleStopIndex }) => {
                if (
                  controllerState &&
                  controllerState.hasMore &&
                  !controllerState.loadingNext &&
                  visibleStopIndex >= messages.length - 10
                ) {
                  void messageHook.loadNextPage().then(() => {
                    virtualListRef.current?.resetAfterIndex(visibleStopIndex - 5);
                  });
                }
              }}
              style={{ outline: "none" }}
            >
              {({ index, style }) => {
                if (index >= messages.length) {
                  return (
                    <div style={style}>
                      <div style={{ padding: "16px", textAlign: "center" }}>
                        {controllerState?.loadingNext ? (
                          <>
                            <LoaderCircle className={`${styles.icon} ${styles.spinner}`} aria-hidden="true" />
                            {t("mail.loadingMore")}
                          </>
                        ) : controllerState?.errorNext ? (
                          <>
                            <div>{controllerState.errorNext}</div>
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => void messageHook.loadNextPage()}
                            >
                              {t("common.retry")}
                            </button>
                          </>
                        ) : controllerState?.hasMore ? (
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => void messageHook.loadNextPage()}
                          >
                            {t("mail.loadMore")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                }

                const msg = messages[index];
                return (
                  <div key={msg.id} style={style}>
                    <div
                      ref={(el) => {
                        const existingObserver = rowResizeObserversRef.current.get(msg.id);
                        if (!el) {
                          rowGroupRefs.current.delete(msg.id);
                          if (existingObserver) {
                            existingObserver.disconnect();
                            rowResizeObserversRef.current.delete(msg.id);
                          }
                          return;
                        }
                        rowGroupRefs.current.set(msg.id, el);
                        if (!existingObserver) {
                          const observer = new ResizeObserver(() => {
                            const measured = Math.ceil(el.getBoundingClientRect().height);
                            const current = rowHeightsRef.current.get(msg.id);
                            if (measured > 0 && current !== measured) {
                              rowHeightsRef.current.set(msg.id, measured);
                              scheduleVirtualListReset(index);
                            }
                          });
                          observer.observe(el);
                          rowResizeObserversRef.current.set(msg.id, observer);
                        }
                        const measured = Math.ceil(el.getBoundingClientRect().height);
                        const current = rowHeightsRef.current.get(msg.id);
                        if (measured > 0 && current !== measured) {
                          rowHeightsRef.current.set(msg.id, measured);
                          scheduleVirtualListReset(index);
                        }
                      }}
                    >
                      <MessageRow
                        msg={msg}
                        isOpen={messageHook.expandedMessageIds.has(msg.id)}
                        activeProfileName={activeProfile.name}
                        canDragEmails={canDragEmails}
                        bimiLogos={messageHook.bimiLogos}
                        bodyLoading={messageHook.bodyLoadingIds.has(msg.id)}
                        bodyError={messageHook.bodyErrors[msg.id]}
                        expandedAttachmentIds={messageHook.expandedAttachmentIds}
                        expandedToIds={messageHook.expandedToIds}
                        folderIdRef={messageHook.folderIdRef}
                        onToggleExpanded={messageHook.toggleExpanded}
                        onToggleAttachments={messageHook.toggleAttachments}
                        onAttachmentAction={(a) => setActiveAttachment(a)}
                        onToggleToIds={(id) => {
                          messageHook.setExpandedToIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            return next;
                          });
                        }}
                        onRowActionsClick={messageHook.setRowActionsMessageId}
                        onDragStart={(emailId, fromFolderId) => {
                          messageHook.setDraggingEmailId(emailId);
                          messageHook.setDraggingEmailFromFolderId(fromFolderId);
                        }}
                        onDragEnd={() => {
                          messageHook.setDraggingEmailId(null);
                          messageHook.setDraggingEmailFromFolderId(null);
                          folderOpsHook.setDropTargetFolderId(null);
                        }}
                      />
                    </div>
                  </div>
                );
              }}
            </VariableSizeList>
          ) : null}
          </div>

          {showFolderSwitchOverlay && (
            <div className={styles.messageListOverlay} role="status" aria-live="polite">
              <div className={styles.messageListOverlayCard}>
                <span className={styles.messageListOverlayDuck} aria-hidden="true">🦆</span>
                <LoaderCircle className={`${styles.icon} ${styles.spinner}`} aria-hidden="true" />
                <span>{messageHook.searchQuery.trim() ? t("mail.searching") : t("mail.loadingEmails")}</span>
              </div>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className={styles.appFooter}>
          <div className={styles.footerQuota}>
            {quotaHook.quotaLoading ? (
              <span className={styles.footerQuotaLoading}>{t("common.loading")}</span>
            ) : quotaHook.quotaError ? (
              <span className={styles.footerQuotaMuted} title={quotaHook.quotaError}>
                {t("mail.quotaUnavailable")}
              </span>
            ) : (() => {
              if (quotaHook.quotas.length === 0) {
                return <span className={styles.footerQuotaMuted}>{t("mail.quotaNotConfigured")}</span>;
              }
              const storageQuota = quotaHook.quotas.find((q) => q.resourceType === "octets");
              if (!storageQuota) {
                const types = Array.from(new Set(quotaHook.quotas.map((q) => q.resourceType))).join(", ");
                return (
                  <span className={styles.footerQuotaMuted} title={t("mail.availableQuotaResourceTypes", { types: types || t("common.none") })}>
                    {t("mail.storageQuotaUnavailable")}
                  </span>
                );
              }
              const limitText = storageQuota.hardLimit ? formatQuotaBytes(storageQuota.hardLimit) : t("common.unlimited");
              return (
                <span className={styles.footerQuotaItem}>
                  {t("mail.spaceUsed", { used: formatQuotaBytes(storageQuota.used), limit: limitText })}
                </span>
              );
            })()}
          </div>
          <div className={styles.footerCopyright}>
            © {new Date().getFullYear()} mail-duck.com
          </div>
        </footer>
      </section>

      {/* Message Actions Sheet */}
      {messageHook.rowActionsMessage && (
        <MessageActionsSheet
          message={messageHook.rowActionsMessage}
          auth={auth}
          onClose={() => messageHook.setRowActionsMessageId(null)}
          onReply={composeHook.beginCompose}
          onForward={composeHook.beginCompose}
          onToggleStar={messageHook.toggleStar}
          onToggleUnread={messageHook.toggleUnread}
          onDelete={messageHook.deleteMessage}
          onDownloadEml={downloadEml}
        />
      )}

      {/* Attachment Actions Sheet */}
      {activeAttachment && (
        <AttachmentActionsSheet
          attachment={activeAttachment}
          onClose={() => setActiveAttachment(null)}
          onPreview={(a) => void previewAttachment(a)}
          onDownload={(a) => void downloadAttachment(a)}
        />
      )}

      {/* Attachment Preview Modal (images) */}
      {attachmentPreview && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={t("mail.preview")}
          onMouseDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
            previewObjectUrlRef.current = null;
            setAttachmentPreview(null);
          }}
        >
          <div className={styles.modal} role="document">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>{attachmentPreview.name}</div>
              <button
                type="button"
                className={styles.modalClose}
                aria-label={t("common.close")}
                title={t("common.close")}
                onClick={() => {
                  if (previewObjectUrlRef.current) URL.revokeObjectURL(previewObjectUrlRef.current);
                  previewObjectUrlRef.current = null;
                  setAttachmentPreview(null);
                }}
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody} style={{ padding: 0 }}>
              <img src={attachmentPreview.url} alt={attachmentPreview.name} style={{ width: "100%", height: "auto", display: "block" }} />
            </div>
          </div>
        </div>
      )}

      {/* Folder Actions Sheet */}
      {folderOpsHook.folderActionsFolderId && folderOpsHook.folderActionsFolder && (
        <FolderActionsSheet
          folder={folderOpsHook.folderActionsFolder}
          isSystemFolder={folderOpsHook.folderActionsIsSystemFolder}
          hasChildren={folderOpsHook.folderActionsHasChildren}
          onClose={() => folderOpsHook.setFolderActionsFolderId(null)}
          onCreateSubfolder={folderOpsHook.openCreateFolder}
          onRename={folderOpsHook.openRenameFolder}
          onDelete={folderOpsHook.openDeleteFolder}
          onMoveToRoot={(id) => void folderOpsHook.performMoveFolder(id, null)}
          onCreateRootFolder={() => folderOpsHook.openCreateFolder(null)}
        />
      )}

      {/* Compose Dock Button */}
      {!composeHook.composeOpen && (
        <button
          type="button"
          className={styles.composeDock}
          aria-label={t(composeHook.composeMinimized ? "mail.resumeDraft" : "mail.compose")}
          title={t(composeHook.composeMinimized ? "mail.resumeDraft" : "mail.compose")}
          onClick={() => {
            if (composeHook.composeMinimized) composeHook.resumeCompose();
            else composeHook.beginCompose({ to: "", subject: "", body: "" });
          }}
        >
          <Pencil className={`${styles.icon} ${styles.composeDockIcon}`} aria-hidden="true" />
          <span className={styles.composeDockLabel}>{t(composeHook.composeMinimized ? "mail.resume" : "mail.compose")}</span>
          {composeHook.composeMinimized && <span className={styles.composeDockDraftPill}>{t("mail.draftCount", { count: 1 })}</span>}
        </button>
      )}

      {/* Mobile Folder Picker */}
      {folderPickerOpen && (
        <div
          id="folder-picker"
          className={styles.sheetOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={t("mail.chooseFolder")}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setFolderPickerOpen(false);
          }}
        >
          <div className={styles.sheet} role="document">
            <div className={styles.sheetHeader}>
              <div className={styles.sheetTitle}>{t("mail.folders")}</div>
            </div>
            <div className={styles.sheetBody}>
              <div className={styles.folderFilterRow}>
                <label className={styles.folderFilterLabel}>
                  <span className={styles.srOnly}>{t("mail.findFolder")}</span>
                  <input
                    className={styles.folderFilter}
                    value={mailboxHook.folderQuery}
                    placeholder={t("mail.findFolderPlaceholder")}
                    onChange={(e) => mailboxHook.setFolderQuery(e.target.value)}
                  />
                </label>
              </div>
              {folderOpsHook.folderUiError && (
                <div className={styles.errorState} role="alert">
                  {folderOpsHook.folderUiError}
                </div>
              )}
              {mailboxHook.mailboxesLoading ? (
                <div className={styles.loadingState} aria-live="polite">
                  <LoaderCircle className={`${styles.icon} ${styles.spinner}`} aria-hidden="true" />
                  {t("mail.loadingFolders")}
                </div>
              ) : mailboxHook.mailboxesError ? (
                <div className={styles.errorState} role="alert">
                  {mailboxHook.mailboxesError}{" "}
                  <button type="button" className={styles.secondaryButton} onClick={() => void mailboxHook.loadMailboxes({ force: true })}>
                    {t("common.retry")}
                  </button>
                </div>
              ) : (
                <FolderTree
                  folders={mailboxHook.folders}
                  folderIndex={mailboxHook.folderIndex}
                  mailboxById={mailboxHook.mailboxById}
                  folderId={mailboxHook.folderId}
                  setFolderId={setFolderIdWithOverlay}
                  effectiveOpenFolderIds={mailboxHook.effectiveOpenFolderIds}
                  visibleFolderIds={mailboxHook.visibleFolderIds}
                  toggleFolderOpen={mailboxHook.toggleFolderOpen}
                  canDragFolders={canDragFolders}
                  canDragEmails={canDragEmails}
                  draggingFolderId={folderOpsHook.draggingFolderId}
                  setDraggingFolderId={folderOpsHook.setDraggingFolderId}
                  dropTargetFolderId={folderOpsHook.dropTargetFolderId}
                  setDropTargetFolderId={folderOpsHook.setDropTargetFolderId}
                  draggingEmailId={messageHook.draggingEmailId}
                  draggingEmailFromFolderId={messageHook.draggingEmailFromFolderId}
                  setDraggingEmailId={messageHook.setDraggingEmailId}
                  setDraggingEmailFromFolderId={messageHook.setDraggingEmailFromFolderId}
                  performMoveFolder={folderOpsHook.performMoveFolder}
                  performMoveEmail={messageHook.performMoveEmail}
                  setFolderActionsFolderId={folderOpsHook.setFolderActionsFolderId}
                  setFolderPickerOpen={setFolderPickerOpen}
                  folderIdRef={messageHook.folderIdRef}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Compose Modal */}
      {composeHook.composeOpen && (
        <ComposeModal
          isDesktop={isDesktop}
          activeProfileName={activeProfile.name}
          composeDraft={composeHook.composeDraft}
          setComposeDraft={composeHook.setComposeDraft}
          composeError={composeHook.composeError}
          composeBusy={composeHook.composeBusy}
          composeShowCc={composeHook.composeShowCc}
          setComposeShowCc={composeHook.setComposeShowCc}
          composeShowBcc={composeHook.composeShowBcc}
          setComposeShowBcc={composeHook.setComposeShowBcc}
          scheduleEnabled={composeHook.scheduleEnabled}
          setScheduleEnabled={composeHook.setScheduleEnabled}
          scheduledFor={composeHook.scheduledFor}
          setScheduledFor={composeHook.setScheduledFor}
          sendMenuOpen={composeHook.sendMenuOpen}
          setSendMenuOpen={composeHook.setSendMenuOpen}
          attachments={composeHook.attachments}
          setAttachments={composeHook.setAttachments}
          setInlineImagesByCid={composeHook.setInlineImagesByCid}
          sendMenuRef={composeHook.sendMenuRef}
          attachmentsInputRef={composeHook.attachmentsInputRef}
          scheduledForInputRef={composeHook.scheduledForInputRef}
          isComposeDirty={composeHook.isComposeDirty}
          onMinimize={composeHook.minimizeCompose}
          onDiscard={composeHook.discardCompose}
          onSaveDraft={composeHook.saveDraftToServer}
          onSend={composeHook.sendComposeToServer}
          onOpenSchedulePicker={composeHook.openSchedulePicker}
          setComposeCancelConfirmOpen={composeHook.setComposeCancelConfirmOpen}
        />
      )}

      {/* Compose Cancel Confirm */}
      {composeHook.composeCancelConfirmOpen && (
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={t("mail.saveDraft")}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) composeHook.setComposeCancelConfirmOpen(false);
          }}
        >
          <div className={styles.confirmModal} role="document">
            <div className={styles.confirmTitle}>{t("mail.saveDraftPrompt")}</div>
            <div className={styles.confirmBody}>{t("mail.saveDraftBody")}</div>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={`${styles.secondaryButton} ${styles.dangerAction}`}
                onClick={() => {
                  composeHook.setComposeCancelConfirmOpen(false);
                  composeHook.discardCompose();
                }}
              >
                {t("common.discard")}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => composeHook.setComposeCancelConfirmOpen(false)}
              >
                {t("common.continueEditing")}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={composeHook.composeBusy}
                onClick={() => {
                  const run = async () => {
                    composeHook.setComposeCancelConfirmOpen(false);
                    await composeHook.saveDraftToServer();
                    composeHook.setComposeOpen(false);
                  };
                  void run();
                }}
              >
                {t("mail.saveDraft")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Operation Modal */}
      {folderOpsHook.folderOpMode && (
        <FolderOperationModal
          mode={folderOpsHook.folderOpMode}
          targetFolder={folderOpsHook.folderOpTargetId ? mailboxHook.folderIndex.byId.get(folderOpsHook.folderOpTargetId) ?? null : null}
          folderOptions={mailboxHook.folderOptions}
          folderOpName={folderOpsHook.folderOpName}
          setFolderOpName={folderOpsHook.setFolderOpName}
          folderOpParentId={folderOpsHook.folderOpParentId}
          setFolderOpParentId={folderOpsHook.setFolderOpParentId}
          folderOpBusy={folderOpsHook.folderOpBusy}
          folderOpError={folderOpsHook.folderOpError}
          onClose={folderOpsHook.closeFolderOp}
          onSubmit={() => void folderOpsHook.submitFolderOp()}
        />
      )}
    </main>
  );
}
