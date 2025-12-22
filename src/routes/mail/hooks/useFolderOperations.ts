import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { createMailbox, deleteMailbox, moveMailbox, renameMailbox, type JmapMailbox } from "../../../jmap/mailbox";
import type { FolderIndex } from "../types";

type Auth = {
  session: { apiUrl: string };
  authHeader: string;
  accountId: string;
} | null;

type UseFolderOperationsParams = {
  auth: Auth;
  folderIndex: FolderIndex;
  mailboxById: Map<string, JmapMailbox>;
  setFolderId: (id: string) => void;
  setOpenFolderIds: Dispatch<SetStateAction<Set<string>>>;
  loadMailboxes: (opts?: { force?: boolean }) => Promise<void>;
};

export function useFolderOperations({
  auth,
  folderIndex,
  mailboxById,
  setFolderId,
  setOpenFolderIds,
  loadMailboxes
}: UseFolderOperationsParams) {
  const { t } = useTranslation();
  const [folderActionsFolderId, setFolderActionsFolderId] = useState<string | null>(null);
  const [folderUiError, setFolderUiError] = useState<string | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);
  const [folderOpMode, setFolderOpMode] = useState<"create" | "rename" | "delete" | null>(null);
  const [folderOpTargetId, setFolderOpTargetId] = useState<string | null>(null);
  const [folderOpBusy, setFolderOpBusy] = useState(false);
  const [folderOpError, setFolderOpError] = useState<string | null>(null);
  const [folderOpName, setFolderOpName] = useState("");
  const [folderOpParentId, setFolderOpParentId] = useState<string | null>(null);

  const folderActionsFolder = useMemo(
    () => (folderActionsFolderId ? folderIndex.byId.get(folderActionsFolderId) ?? null : null),
    [folderActionsFolderId, folderIndex.byId]
  );
  const folderActionsMailbox = useMemo(
    () => (folderActionsFolderId ? mailboxById.get(folderActionsFolderId) ?? null : null),
    [folderActionsFolderId, mailboxById]
  );
  const folderActionsIsSystemFolder = useMemo(
    () => ((folderActionsMailbox?.role ?? "").trim().length > 0),
    [folderActionsMailbox]
  );
  const folderActionsHasChildren = useMemo(() => {
    if (!folderActionsFolderId) return false;
    return (folderIndex.childrenByParent.get(folderActionsFolderId) ?? []).length > 0;
  }, [folderActionsFolderId, folderIndex.childrenByParent]);

  const showFolderUiError = useCallback((message: string) => {
    setFolderUiError(message);
    window.setTimeout(() => setFolderUiError((cur) => (cur === message ? null : cur)), 3000);
  }, []);

  const openCreateFolder = useCallback((parentId: string | null) => {
    setFolderOpError(null);
    setFolderOpName("");
    setFolderOpTargetId(null);
    setFolderOpParentId(parentId);
    setFolderOpMode("create");
  }, []);

  const openRenameFolder = useCallback((targetId: string) => {
    const target = folderIndex.byId.get(targetId);
    if (!target) return;
    setFolderOpError(null);
    setFolderOpTargetId(targetId);
    setFolderOpName(target.name);
    setFolderOpParentId(null);
    setFolderOpMode("rename");
  }, [folderIndex.byId]);

  const openDeleteFolder = useCallback((targetId: string) => {
    if (!folderIndex.byId.has(targetId)) return;
    setFolderOpError(null);
    setFolderOpTargetId(targetId);
    setFolderOpMode("delete");
  }, [folderIndex.byId]);

  const closeFolderOp = useCallback((opts?: { force?: boolean }) => {
    if (folderOpBusy && !opts?.force) return;
    setFolderOpMode(null);
    setFolderOpError(null);
    setFolderOpTargetId(null);
    setFolderOpName("");
    setFolderOpParentId(null);
  }, [folderOpBusy]);

  const submitFolderOp = useCallback(async () => {
    if (!auth) return;
    if (!folderOpMode) return;
    if (folderOpBusy) return;
    setFolderOpError(null);

    const trimmedName = folderOpName.trim();
    if (folderOpMode === "create" || folderOpMode === "rename") {
      if (trimmedName.length === 0) {
        setFolderOpError(t("mail.folderNameRequired"));
        return;
      }
      if (trimmedName.includes("/") || trimmedName.includes("\\")) {
        setFolderOpError(t("mail.folderNameNoSlashes"));
        return;
      }
    }

    if (folderOpMode === "rename" || folderOpMode === "delete") {
      if (!folderOpTargetId) {
        setFolderOpError(t("mail.noFolderSelected"));
        return;
      }
      const role = (mailboxById.get(folderOpTargetId)?.role ?? "").trim();
      if (role.length > 0) {
        setFolderOpError(t("mail.systemFolderCannotBeModified"));
        return;
      }
      if (folderOpMode === "delete") {
        const hasChildren = (folderIndex.childrenByParent.get(folderOpTargetId) ?? []).length > 0;
        if (hasChildren) {
          setFolderOpError(t("mail.folderHasSubfolders"));
          return;
        }
      }
    }

    setFolderOpBusy(true);
    try {
      if (folderOpMode === "create") {
        const { mailboxId } = await createMailbox({
          apiUrl: auth.session.apiUrl,
          authHeader: auth.authHeader,
          accountId: auth.accountId,
          name: trimmedName,
          parentId: folderOpParentId ?? null
        });
        await loadMailboxes({ force: true });
        setFolderId(mailboxId);
        if (folderOpParentId) {
          setOpenFolderIds((prev) => {
            const next = new Set(prev);
            next.add(folderOpParentId);
            return next;
          });
        }
        closeFolderOp({ force: true });
        return;
      }

      if (folderOpMode === "rename") {
        await renameMailbox({
          apiUrl: auth.session.apiUrl,
          authHeader: auth.authHeader,
          accountId: auth.accountId,
          mailboxId: folderOpTargetId!,
          name: trimmedName
        });
        await loadMailboxes({ force: true });
        closeFolderOp({ force: true });
        return;
      }

      if (folderOpMode === "delete") {
        await deleteMailbox({
          apiUrl: auth.session.apiUrl,
          authHeader: auth.authHeader,
          accountId: auth.accountId,
          mailboxId: folderOpTargetId!
        });
        await loadMailboxes({ force: true });
        setFolderId("");
        closeFolderOp({ force: true });
      }
    } catch (err) {
      setFolderOpError(err instanceof Error ? err.message : "Folder operation failed");
    } finally {
      setFolderOpBusy(false);
    }
  }, [auth, closeFolderOp, folderIndex.childrenByParent, folderOpBusy, folderOpMode, folderOpName, folderOpParentId, folderOpTargetId, loadMailboxes, mailboxById, setFolderId, setOpenFolderIds, t]);

  const canDropFolder = useCallback((dragId: string, newParentId: string | null): boolean => {
    if (!dragId) return false;
    if (newParentId === dragId) return false;
    if (!newParentId) return true;
    let cur: string | null | undefined = newParentId;
    while (cur) {
      if (cur === dragId) return false;
      cur = folderIndex.byId.get(cur)?.parentId ?? null;
    }
    return true;
  }, [folderIndex.byId]);

  const performMoveFolder = useCallback(async (dragId: string, newParentId: string | null) => {
    if (!auth) return;
    const role = (mailboxById.get(dragId)?.role ?? "").trim();
    if (role.length > 0) {
      showFolderUiError("System folders cannot be moved.");
      return;
    }
    if (!canDropFolder(dragId, newParentId)) {
      showFolderUiError("Invalid move (would create a loop).");
      return;
    }
    try {
      await moveMailbox({
        apiUrl: auth.session.apiUrl,
        authHeader: auth.authHeader,
        accountId: auth.accountId,
        mailboxId: dragId,
        parentId: newParentId
      });
      await loadMailboxes({ force: true });
      setFolderId(dragId);
      if (newParentId) {
        setOpenFolderIds((prev) => {
          const next = new Set(prev);
          next.add(newParentId);
          return next;
        });
      }
    } catch (err) {
      showFolderUiError(err instanceof Error ? err.message : "Failed to move folder");
    }
  }, [auth, canDropFolder, loadMailboxes, mailboxById, setFolderId, setOpenFolderIds, showFolderUiError]);

  return {
    folderActionsFolderId,
    setFolderActionsFolderId,
    folderActionsFolder,
    folderActionsIsSystemFolder,
    folderActionsHasChildren,
    folderUiError,
    showFolderUiError,
    draggingFolderId,
    setDraggingFolderId,
    dropTargetFolderId,
    setDropTargetFolderId,
    folderOpMode,
    folderOpTargetId,
    folderOpBusy,
    folderOpError,
    folderOpName,
    setFolderOpName,
    folderOpParentId,
    setFolderOpParentId,
    openCreateFolder,
    openRenameFolder,
    openDeleteFolder,
    closeFolderOp,
    submitFolderOp,
    canDropFolder,
    performMoveFolder
  };
}

