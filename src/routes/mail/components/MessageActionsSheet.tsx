import { useTranslation } from "react-i18next";
import {
  FileDown,
  Forward,
  Mail,
  MailOpen,
  Reply,
  Star,
  Trash2
} from "lucide-react";
import type { Message, ComposeDraft } from "../types";
import styles from "../../mail.module.css";

type MessageActionsSheetProps = {
  message: Message;
  auth: { session: { downloadUrl: string }; authHeader: string; accountId: string } | null;
  onClose: () => void;
  onReply: (draft: Partial<ComposeDraft>) => void;
  onForward: (draft: Partial<ComposeDraft>) => void;
  onToggleStar: (id: string) => void;
  onToggleUnread: (id: string) => void;
  onDelete: (id: string) => void;
  onDownloadEml: (message: Message) => void;
};

export function MessageActionsSheet({
  message,
  auth,
  onClose,
  onReply,
  onForward,
  onToggleStar,
  onToggleUnread,
  onDelete,
  onDownloadEml
}: MessageActionsSheetProps) {
  const { t } = useTranslation();

  return (
    <div
      className={styles.sheetOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={t("mail.messageActions")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.sheet} role="document">
        <div className={styles.sheetHeader}>
          <div className={styles.sheetTitle}>{t("mail.actions")}</div>
        </div>
        <div className={styles.sheetBody}>
          <button
            className={styles.sendMenuItem}
            type="button"
            onClick={() => {
              onReply({ to: message.from, subject: `Re: ${message.subject}`, body: "" });
              onClose();
            }}
          >
            <span className={styles.sendMenuItemRow}>
              <Reply className={styles.icon} aria-hidden="true" />
              {t("mail.reply")}
            </span>
          </button>

          <button
            className={styles.sendMenuItem}
            type="button"
            onClick={() => {
              onForward({
                to: "",
                subject: `Fwd: ${message.subject}`,
                body: message.text ?? ""
              });
              onClose();
            }}
          >
            <span className={styles.sendMenuItemRow}>
              <Forward className={styles.icon} aria-hidden="true" />
              {t("mail.forward")}
            </span>
          </button>

          <button
            className={styles.sendMenuItem}
            type="button"
            onClick={() => {
              onToggleStar(message.id);
              onClose();
            }}
          >
            <span className={styles.sendMenuItemRow}>
              <Star
                className={styles.icon}
                aria-hidden="true"
                fill={message.starred ? "currentColor" : "none"}
              />
              {message.starred ? t("mail.unstar") : t("mail.star")}
            </span>
          </button>

          <button
            className={styles.sendMenuItem}
            type="button"
            onClick={() => {
              onToggleUnread(message.id);
              onClose();
            }}
          >
            <span className={styles.sendMenuItemRow}>
              {message.unread ? (
                <MailOpen className={styles.icon} aria-hidden="true" />
              ) : (
                <Mail className={styles.icon} aria-hidden="true" />
              )}
              {message.unread ? t("mail.markRead") : t("mail.markUnread")}
            </span>
          </button>

          <button
            className={styles.sendMenuItem}
            type="button"
            title={!message.blobId ? t("mail.sourceUnavailable") : t("mail.downloadAsEml")}
            disabled={!auth || !message.blobId}
            onClick={() => {
              void onDownloadEml(message);
              onClose();
            }}
          >
            <span className={styles.sendMenuItemRow}>
              <FileDown className={styles.icon} aria-hidden="true" />
              {t("mail.downloadSourceEml")}
            </span>
          </button>

          <button
            className={styles.sendMenuItem}
            type="button"
            onClick={() => {
              onDelete(message.id);
              onClose();
            }}
          >
            <span className={styles.sendMenuItemRow}>
              <Trash2 className={styles.icon} aria-hidden="true" />
              {t("common.delete")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

