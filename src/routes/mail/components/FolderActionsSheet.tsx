import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  Pencil,
  Plus,
  Trash2
} from "lucide-react";
import type { Folder } from "../types";
import styles from "../../mail.module.css";

type FolderActionsSheetProps = {
  folder: Folder;
  isSystemFolder: boolean;
  hasChildren: boolean;
  onClose: () => void;
  onCreateSubfolder: (parentId: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onMoveToRoot: (id: string) => void;
  onCreateRootFolder: () => void;
};

export function FolderActionsSheet({
  folder,
  isSystemFolder,
  hasChildren,
  onClose,
  onCreateSubfolder,
  onRename,
  onDelete,
  onMoveToRoot,
  onCreateRootFolder
}: FolderActionsSheetProps) {
  const { t } = useTranslation();

  return (
    <div
      className={styles.sheetOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={t("mail.folderActions")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.sheet} role="document">
        <div className={styles.sheetHeader}>
          <div className={styles.sheetTitle}>{t("mail.actions")}</div>
        </div>
        <div className={styles.sheetBody}>
          <div className={styles.listTitle} style={{ padding: "0 2px 6px" }}>
            🦆 {folder.name}
          </div>

          <button
            className={styles.sendMenuItem}
            type="button"
            onClick={() => {
              onClose();
              onCreateSubfolder(folder.id);
            }}
          >
            <span className={styles.sendMenuItemRow}>
              <Plus className={styles.icon} aria-hidden="true" />
              {t("mail.newSubfolder")}
            </span>
          </button>

          <button
            className={styles.sendMenuItem}
            type="button"
            disabled={isSystemFolder}
            title={t(isSystemFolder ? "mail.systemFolderCannotBeRenamed" : "mail.renameFolder")}
            onClick={() => {
              onClose();
              onRename(folder.id);
            }}
          >
            <span className={styles.sendMenuItemRow}>
              <Pencil className={styles.icon} aria-hidden="true" />
              {t("mail.rename")}
            </span>
          </button>

          <button
            className={styles.sendMenuItem}
            type="button"
            disabled={isSystemFolder || hasChildren}
            title={
              isSystemFolder
                ? t("mail.systemFolderCannotBeDeleted")
                : hasChildren
                  ? t("mail.deleteSubfoldersFirst")
                  : t("mail.deleteFolder")
            }
            onClick={() => {
              onClose();
              onDelete(folder.id);
            }}
          >
            <span className={styles.sendMenuItemRow}>
              <Trash2 className={styles.icon} aria-hidden="true" />
              {t("common.delete")}
            </span>
          </button>

          <button
            className={styles.sendMenuItem}
            type="button"
            disabled={isSystemFolder}
            title={t(isSystemFolder ? "mail.systemFolderCannotBeMoved" : "mail.moveToRoot")}
            onClick={() => {
              onClose();
              void onMoveToRoot(folder.id);
            }}
          >
            <span className={styles.sendMenuItemRow}>
              <ChevronDown className={styles.icon} aria-hidden="true" />
              {t("mail.moveToRoot")}
            </span>
          </button>

          <button
            className={styles.sendMenuItem}
            type="button"
            onClick={() => {
              onClose();
              onCreateRootFolder();
            }}
          >
            <span className={styles.sendMenuItemRow}>
              <Plus className={styles.icon} aria-hidden="true" />
              {t("mail.newFolderRoot")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

