import { useTranslation } from "react-i18next";
import { Download, Eye, Image as ImageIcon, Paperclip } from "lucide-react";

import type { Attachment } from "../types";
import { formatBytes } from "../utils";
import styles from "../../mail.module.css";

type AttachmentActionsSheetProps = {
  attachment: Attachment;
  onClose: () => void;
  onPreview: (attachment: Attachment) => void;
  onDownload: (attachment: Attachment) => void;
};

export function AttachmentActionsSheet({ attachment, onClose, onPreview, onDownload }: AttachmentActionsSheetProps) {
  const { t } = useTranslation();
  const isInline = attachment.disposition === "inline";
  const icon = isInline ? <ImageIcon className={styles.icon} aria-hidden="true" /> : <Paperclip className={styles.icon} aria-hidden="true" />;

  return (
    <div
      className={styles.sheetOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={t("mail.attachmentActions")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.sheet} role="document">
        <div className={styles.sheetHeader}>
          <div className={styles.sheetTitle}>{t("mail.attachment")}</div>
        </div>
        <div className={styles.sheetBody}>
          <div className={styles.attachmentSheetMeta}>
            <div className={styles.attachmentSheetNameRow}>
              {icon}
              <span className={styles.attachmentSheetName}>{attachment.name}</span>
            </div>
            <div className={styles.attachmentSheetSub}>
              <span>{formatBytes(attachment.sizeBytes)}</span>
              <span className={styles.attachmentSheetDot} aria-hidden="true">
                ·
              </span>
              <span>{attachment.contentType}</span>
              {isInline && (
                <>
                  <span className={styles.attachmentSheetDot} aria-hidden="true">
                    ·
                  </span>
                  <span>{t("mail.inlineImage")}</span>
                </>
              )}
            </div>
          </div>

          <button
            className={styles.sendMenuItem}
            type="button"
            onClick={() => {
              onPreview(attachment);
              onClose();
            }}
          >
            <span className={styles.sendMenuItemRow}>
              <Eye className={styles.icon} aria-hidden="true" />
              {t("mail.preview")}
            </span>
          </button>

          <button
            className={styles.sendMenuItem}
            type="button"
            onClick={() => {
              onDownload(attachment);
              onClose();
            }}
          >
            <span className={styles.sendMenuItemRow}>
              <Download className={styles.icon} aria-hidden="true" />
              {t("mail.download")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}


