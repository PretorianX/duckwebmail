import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  MoreHorizontal
} from "lucide-react";
import type { JmapMailbox } from "../../../jmap/mailbox";
import type { Folder, FolderIndex } from "../types";
import styles from "../../mail.module.css";

type FolderTreeProps = {
  folders: Folder[];
  folderIndex: FolderIndex;
  mailboxById: Map<string, JmapMailbox>;
  folderId: string;
  setFolderId: (id: string) => void;
  effectiveOpenFolderIds: Set<string>;
  visibleFolderIds: Set<string> | null;
  toggleFolderOpen: (id: string) => void;
  canDragFolders: boolean;
  canDragEmails: boolean;
  draggingFolderId: string | null;
  setDraggingFolderId: (id: string | null) => void;
  dropTargetFolderId: string | null;
  setDropTargetFolderId: (id: string | null) => void;
  draggingEmailId: string | null;
  draggingEmailFromFolderId: string | null;
  setDraggingEmailId: (id: string | null) => void;
  setDraggingEmailFromFolderId: (id: string | null) => void;
  performMoveFolder: (dragId: string, newParentId: string | null) => Promise<void>;
  performMoveEmail: (params: { emailId: string; fromFolderId: string; toFolderId: string }) => Promise<void>;
  setFolderActionsFolderId: (id: string | null) => void;
  setFolderPickerOpen?: (open: boolean) => void;
  folderIdRef: React.MutableRefObject<string>;
};

export function FolderTree({
  folders,
  folderIndex,
  mailboxById,
  folderId,
  setFolderId,
  effectiveOpenFolderIds,
  visibleFolderIds,
  toggleFolderOpen,
  canDragFolders,
  canDragEmails,
  draggingFolderId,
  setDraggingFolderId,
  dropTargetFolderId,
  setDropTargetFolderId,
  draggingEmailId,
  draggingEmailFromFolderId,
  setDraggingEmailId,
  setDraggingEmailFromFolderId,
  performMoveFolder,
  performMoveEmail,
  setFolderActionsFolderId,
  setFolderPickerOpen,
  folderIdRef
}: FolderTreeProps) {
  const { t } = useTranslation();

  const renderNode = (f: Folder, depth: number): ReactNode => {
    if (visibleFolderIds && !visibleFolderIds.has(f.id)) return null;
    const children = folderIndex.childrenByParent.get(f.id) ?? [];
    const hasChildren = children.length > 0;
    const isOpen = hasChildren && effectiveOpenFolderIds.has(f.id);
    const active = f.id === folderId;

    return (
      <div key={f.id} className={styles.folderNode}>
        <div
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={hasChildren ? isOpen : undefined}
          className={`${styles.folderItem} ${active ? styles.folderItemActive : ""} ${
            dropTargetFolderId === f.id ? styles.folderItemDropTarget : ""
          }`}
          tabIndex={0}
          aria-current={active ? "page" : undefined}
          draggable={canDragFolders && (mailboxById.get(f.id)?.role ?? "").trim().length === 0}
          onDragStart={(e) => {
            if (!canDragFolders) return;
            setDraggingFolderId(f.id);
            e.dataTransfer.setData("text/plain", f.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            if (!canDragFolders) return;
            setDraggingFolderId(null);
            setDropTargetFolderId(null);
          }}
          onDragEnter={(e) => {
            if (canDragFolders && draggingFolderId) {
              e.preventDefault();
              setDropTargetFolderId(f.id);
              return;
            }
            if (canDragEmails && draggingEmailId) {
              e.preventDefault();
              setDropTargetFolderId(f.id);
            }
          }}
          onDragOver={(e) => {
            if (canDragFolders && draggingFolderId) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              return;
            }
            if (canDragEmails && draggingEmailId) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();

            if (canDragFolders && draggingFolderId) {
              const dragId = draggingFolderId ?? e.dataTransfer.getData("text/plain");
              setDraggingFolderId(null);
              setDropTargetFolderId(null);
              void performMoveFolder(dragId, f.id);
              return;
            }

            if (canDragEmails && draggingEmailId) {
              const emailId = draggingEmailId;
              const fromFolderId = draggingEmailFromFolderId ?? folderIdRef.current;
              setDraggingEmailId(null);
              setDraggingEmailFromFolderId(null);
              setDropTargetFolderId(null);
              void performMoveEmail({ emailId, fromFolderId, toFolderId: f.id });
            }
          }}
          onClick={() => setFolderId(f.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFolderId(f.id);
            }
          }}
        >
          <span
            className={`${styles.folderLabel} ${f.unread > 0 ? styles.folderLabelUnread : ""} ${
              hasChildren ? styles.folderLabelParent : ""
            } ${hasChildren && isOpen ? styles.folderLabelParentOpen : ""}`}
            style={{ paddingLeft: `${6 + depth * 12}px` }}
          >
            {depth > 0 && <CornerDownRight className={`${styles.icon} ${styles.folderBranchIcon}`} aria-hidden="true" />}
            <span
              className={`${styles.folderToggle} ${hasChildren ? "" : styles.folderTogglePlaceholder}`}
              role={hasChildren ? "button" : undefined}
              tabIndex={hasChildren ? 0 : -1}
              aria-label={hasChildren ? `${isOpen ? "Collapse" : "Expand"} ${f.name}` : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) toggleFolderOpen(f.id);
              }}
              onKeyDown={(e) => {
                if (!hasChildren) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleFolderOpen(f.id);
                }
              }}
            >
              {hasChildren ? (
                isOpen ? (
                  <ChevronDown className={styles.icon} aria-hidden="true" />
                ) : (
                  <ChevronRight className={styles.icon} aria-hidden="true" />
                )
              ) : (
                <span className={styles.folderToggleSpacer} aria-hidden="true" />
              )}
            </span>
            <span
              className={styles.folderDuck}
              aria-hidden="true"
              style={{ visibility: active ? "visible" : "hidden" }}
            >
              🦆
            </span>
            <span className={styles.folderNameText}>{f.name}</span>
          </span>
          <span className={styles.folderRight} onClick={(e) => e.stopPropagation()}>
            {f.unread > 0 && <span className={styles.unreadPill}>{f.unread}</span>}
            <button
              type="button"
              className={`${styles.iconButton} ${styles.folderMoreButton}`}
              aria-label={t("mail.folderActionsName", { name: f.name })}
              title={t("mail.folderActions")}
              onClick={() => {
                setFolderPickerOpen?.(false);
                setFolderActionsFolderId(f.id);
              }}
              onFocus={() => setDropTargetFolderId(null)}
            >
              <MoreHorizontal className={styles.icon} aria-hidden="true" />
            </button>
          </span>
        </div>

        {hasChildren && isOpen && (
          <div role="group" className={styles.folderChildren}>
            {children.map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const rootFolders = folderIndex.childrenByParent.get(null) ?? [];

  return (
    <div
      className={styles.folderTree}
      role="tree"
      aria-label={t("mail.folders")}
      onDragOver={(e) => {
        if (canDragFolders && draggingFolderId) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          return;
        }
        if (canDragEmails && draggingEmailId) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(e) => {
        if (!canDragFolders) return;
        if (!draggingFolderId) return;
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        const dragId = draggingFolderId ?? e.dataTransfer.getData("text/plain");
        setDraggingFolderId(null);
        setDropTargetFolderId(null);
        void performMoveFolder(dragId, null);
      }}
    >
      {folders.length === 0 ? (
        <div className={styles.emptyState}>{t("mail.noFolders")}</div>
      ) : (
        rootFolders
          .filter((root) => (visibleFolderIds ? visibleFolderIds.has(root.id) : true))
          .map((root) => renderNode(root, 0))
      )}
    </div>
  );
}

