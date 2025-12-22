import { useCallback, useEffect, useMemo, useState } from "react";
import { getMailboxes, type JmapMailbox } from "../../../jmap/mailbox";
import type { Folder, FolderIndex } from "../types";
import { sortMailboxes, toFolder, pickDefaultFolderId, buildFolderIndex, buildFolderOptions, computeVisibleFolders } from "../utils";

type Auth = {
  session: { apiUrl: string };
  authHeader: string;
  accountId: string;
} | null;

export function useMailboxes(auth: Auth) {
  const [mailboxesLoading, setMailboxesLoading] = useState(false);
  const [mailboxesError, setMailboxesError] = useState<string | null>(null);
  const [mailboxes, setMailboxes] = useState<JmapMailbox[]>([]);
  const [folderId, setFolderId] = useState<string>("");
  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(() => new Set());
  const [folderQuery, setFolderQuery] = useState("");

  const mailboxById = useMemo(() => new Map(mailboxes.map((m) => [m.id, m])), [mailboxes]);
  const folders: Folder[] = useMemo(() => mailboxes.map(toFolder), [mailboxes]);
  const folderIndex: FolderIndex = useMemo(() => buildFolderIndex(folders), [folders]);
  const folderOptions = useMemo(() => buildFolderOptions(folderIndex.childrenByParent), [folderIndex.childrenByParent]);

  const selectedMailbox = useMemo(() => mailboxById.get(folderId) ?? null, [folderId, mailboxById]);
  const folder = useMemo(() => {
    const selected = folderIndex.byId.get(folderId);
    if (selected) return selected;
    const first = folders[0];
    return first ?? { id: "", name: "Folders", unread: 0, parentId: null };
  }, [folderId, folderIndex.byId, folders]);

  const { visibleFolderIds, autoExpandFolderIds } = useMemo(
    () => computeVisibleFolders(folderQuery, folders, folderIndex),
    [folderQuery, folders, folderIndex]
  );

  const effectiveOpenFolderIds = useMemo(() => {
    if (!visibleFolderIds) return openFolderIds;
    const next = new Set(openFolderIds);
    for (const id of autoExpandFolderIds) next.add(id);
    return next;
  }, [autoExpandFolderIds, openFolderIds, visibleFolderIds]);

  const loadMailboxes = useCallback(async (opts?: { force?: boolean }) => {
    if (!auth) return;
    setMailboxesError(null);
    setMailboxesLoading(true);
    try {
      const res = await getMailboxes({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        force: opts?.force
      });
      const sorted = [...res.mailboxes].sort(sortMailboxes);
      setMailboxes(sorted);
    } catch (err) {
      setMailboxesError(err instanceof Error ? err.message : "Failed to load folders");
      setMailboxes([]);
    } finally {
      setMailboxesLoading(false);
    }
  }, [auth]);

  const toggleFolderOpen = useCallback((id: string) => {
    setOpenFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Initial load
  useEffect(() => {
    void loadMailboxes();
  }, [loadMailboxes]);

  // Set default folder after mailboxes load
  useEffect(() => {
    if (mailboxesLoading) return;
    if (mailboxes.length === 0) return;
    setFolderId((prev) => {
      if (prev && mailboxes.some((m) => m.id === prev)) return prev;
      return pickDefaultFolderId(mailboxes) ?? prev;
    });
  }, [mailboxes, mailboxesLoading]);

  // Auto-expand inbox and archive
  useEffect(() => {
    if (mailboxesLoading) return;
    if (mailboxes.length === 0) return;
    const byRole = (role: string) => mailboxes.find((m) => (m.role ?? "").toLowerCase() === role)?.id ?? null;
    const inboxId = byRole("inbox");
    const archiveId = byRole("archive");
    setOpenFolderIds((prev) => {
      const next = new Set(prev);
      if (inboxId) next.add(inboxId);
      if (archiveId) next.add(archiveId);
      return next;
    });
  }, [mailboxes, mailboxesLoading]);

  return {
    mailboxes,
    mailboxesLoading,
    mailboxesError,
    mailboxById,
    folders,
    folderIndex,
    folderOptions,
    folderId,
    setFolderId,
    folder,
    selectedMailbox,
    openFolderIds,
    setOpenFolderIds,
    effectiveOpenFolderIds,
    folderQuery,
    setFolderQuery,
    visibleFolderIds,
    toggleFolderOpen,
    loadMailboxes
  };
}

