import { useTranslation } from "react-i18next";
import type { Folder, FolderOption } from "../types";
import styles from "../../mail.module.css";

type FolderOperationModalProps = {
  mode: "create" | "rename" | "delete";
  targetFolder: Folder | null;
  folderOptions: FolderOption[];
  folderOpName: string;
  setFolderOpName: (name: string) => void;
  folderOpParentId: string | null;
  setFolderOpParentId: (id: string | null) => void;
  folderOpBusy: boolean;
  folderOpError: string | null;
  onClose: () => void;
  onSubmit: () => void;
};

export function FolderOperationModal({
  mode,
  targetFolder,
  folderOptions,
  folderOpName,
  setFolderOpName,
  folderOpParentId,
  setFolderOpParentId,
  folderOpBusy,
  folderOpError,
  onClose,
  onSubmit
}: FolderOperationModalProps) {
  const { t } = useTranslation();

  const title = mode === "create"
    ? t("mail.newFolder")
    : mode === "rename"
      ? t("mail.renameFolder")
      : t("mail.deleteFolder");

  return (
    <div
      className={styles.confirmOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (folderOpBusy) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.folderOpModal} role="document">
        <div className={styles.confirmTitle}>{title}</div>

        {folderOpError && (
          <div className={styles.folderOpError} role="alert">
            {folderOpError}
          </div>
        )}

        {mode === "delete" ? (
          <div className={styles.confirmBody}>
            {t("mail.delete")}{" "}
            <strong>{targetFolder?.name ?? t("mail.thisFolder")}</strong>
            {t("mail.deleteFolderConfirmSuffix")}
          </div>
        ) : (
          <div className={styles.folderOpForm}>
            {mode === "create" && (
              <label className={styles.folderOpField}>
                <span className={styles.folderOpLabel}>{t("mail.parent")}</span>
                <select
                  className={styles.input}
                  value={folderOpParentId ?? ""}
                  onChange={(e) => setFolderOpParentId(e.target.value === "" ? null : e.target.value)}
                  disabled={folderOpBusy}
                >
                  <option value="">{t("mail.root")}</option>
                  {folderOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {`${"— ".repeat(o.depth)}${o.label}`}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className={styles.folderOpField}>
              <span className={styles.folderOpLabel}>{t("common.name")}</span>
              <input
                className={styles.input}
                type="text"
                value={folderOpName}
                onChange={(e) => setFolderOpName(e.target.value)}
                placeholder={mode === "create" ? t("mail.folderNameExample") : undefined}
                autoFocus
                disabled={folderOpBusy}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSubmit();
                }}
              />
            </label>
          </div>
        )}

        <div className={styles.confirmActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={folderOpBusy}
          >
            {t("common.cancel")}
          </button>
          {mode === "delete" ? (
            <button
              type="button"
              className={`${styles.secondaryButton} ${styles.dangerAction}`}
              onClick={onSubmit}
              disabled={folderOpBusy}
            >
              {folderOpBusy ? t("mail.deleting") : t("common.delete")}
            </button>
          ) : (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={onSubmit}
              disabled={folderOpBusy}
            >
              {mode === "create"
                ? folderOpBusy
                  ? t("mail.creating")
                  : t("mail.create")
                : folderOpBusy
                  ? t("mail.saving")
                  : t("common.save")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

