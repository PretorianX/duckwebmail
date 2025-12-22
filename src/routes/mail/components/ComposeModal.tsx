import type { Dispatch, RefObject, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  Clock,
  Mail,
  Paperclip,
  Save,
  X
} from "lucide-react";
import ComposeEditor from "../../../shared/ComposeEditor";
import type { ComposeDraft } from "../types";
import styles from "../../mail.module.css";

type ComposeModalProps = {
  isDesktop: boolean;
  activeProfileName: string;
  composeDraft: ComposeDraft;
  setComposeDraft: Dispatch<SetStateAction<ComposeDraft>>;
  composeError: string | null;
  composeBusy: boolean;
  composeShowCc: boolean;
  setComposeShowCc: (show: boolean) => void;
  composeShowBcc: boolean;
  setComposeShowBcc: (show: boolean) => void;
  scheduleEnabled: boolean;
  setScheduleEnabled: (enabled: boolean) => void;
  scheduledFor: string;
  setScheduledFor: (value: string) => void;
  sendMenuOpen: boolean;
  setSendMenuOpen: (open: boolean) => void;
  attachments: File[];
  setAttachments: Dispatch<SetStateAction<File[]>>;
  setInlineImagesByCid: Dispatch<SetStateAction<Record<string, File>>>;
  sendMenuRef: RefObject<HTMLDivElement | null>;
  attachmentsInputRef: RefObject<HTMLInputElement | null>;
  scheduledForInputRef: RefObject<HTMLInputElement | null>;
  isComposeDirty: boolean;
  onMinimize: () => void;
  onDiscard: () => void;
  onSaveDraft: () => Promise<void>;
  onSend: () => Promise<void>;
  onOpenSchedulePicker: () => void;
  setComposeCancelConfirmOpen: (open: boolean) => void;
};

export function ComposeModal({
  isDesktop,
  activeProfileName,
  composeDraft,
  setComposeDraft,
  composeError,
  composeBusy,
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
  setInlineImagesByCid,
  sendMenuRef,
  attachmentsInputRef,
  scheduledForInputRef,
  isComposeDirty,
  onMinimize,
  onDiscard,
  onSaveDraft,
  onSend,
  onOpenSchedulePicker,
  setComposeCancelConfirmOpen
}: ComposeModalProps) {
  const { t } = useTranslation();

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={t("mail.composeEmail")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onMinimize();
      }}
    >
      <div className={styles.modal} role="document">
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>{t("mail.newEmail")}</div>
        </div>

        <div className={styles.modalBody}>
          {composeError && (
            <div className={styles.errorState} role="alert" style={{ marginBottom: 10 }}>
              {composeError}
            </div>
          )}
          <div className={styles.field}>
            <div className={styles.fieldHeaderRow}>
              <div className={styles.fieldLabel}>{t("mail.from")}</div>
              {isDesktop && activeProfileName.trim() !== "" && (
                <div className={styles.fieldHint} title={t("profile.profile")}>
                  {activeProfileName}
                </div>
              )}
            </div>
            <input
              className={styles.input}
              type="email"
              placeholder={t("mail.senderPlaceholder")}
              value={composeDraft.from}
              disabled={composeBusy}
              onChange={(e) => setComposeDraft((prev) => ({ ...prev, from: e.target.value }))}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHeaderRow}>
              <div className={styles.fieldLabel}>{t("mail.to")}</div>
              {isDesktop && (
                <div className={styles.fieldActions}>
                  <button
                    type="button"
                    className={styles.miniToggle}
                    aria-pressed={composeShowCc}
                    title={t("mail.addCc")}
                    onClick={() => setComposeShowCc(!composeShowCc)}
                    disabled={composeBusy}
                  >
                    CC
                  </button>
                  <button
                    type="button"
                    className={styles.miniToggle}
                    aria-pressed={composeShowBcc}
                    title={t("mail.addBcc")}
                    onClick={() => setComposeShowBcc(!composeShowBcc)}
                    disabled={composeBusy}
                  >
                    BCC
                  </button>
                </div>
              )}
            </div>
            <input
              className={styles.input}
              type="email"
              placeholder={t("mail.recipientPlaceholder")}
              value={composeDraft.to}
              disabled={composeBusy}
              onChange={(e) => setComposeDraft((prev) => ({ ...prev, to: e.target.value }))}
            />
          </div>

          {(composeShowCc || composeDraft.cc.trim() !== "") && (
            <label className={styles.field}>
              CC
              <input
                className={styles.input}
                type="email"
                placeholder={t("mail.ccPlaceholder")}
                value={composeDraft.cc}
                disabled={composeBusy}
                onChange={(e) => setComposeDraft((prev) => ({ ...prev, cc: e.target.value }))}
              />
            </label>
          )}

          {(composeShowBcc || composeDraft.bcc.trim() !== "") && (
            <label className={styles.field}>
              BCC
              <input
                className={styles.input}
                type="email"
                placeholder={t("mail.bccPlaceholder")}
                value={composeDraft.bcc}
                disabled={composeBusy}
                onChange={(e) => setComposeDraft((prev) => ({ ...prev, bcc: e.target.value }))}
              />
            </label>
          )}

          <label className={styles.field}>
            {t("mail.subject")}
            <input
              className={styles.input}
              type="text"
              placeholder={t("mail.subjectPlaceholder")}
              value={composeDraft.subject}
              disabled={composeBusy}
              onChange={(e) => setComposeDraft((prev) => ({ ...prev, subject: e.target.value }))}
            />
          </label>

          {scheduleEnabled && (
            <label className={styles.field}>
              {t("mail.scheduledFor")}
              <input
                ref={scheduledForInputRef as RefObject<HTMLInputElement>}
                className={`${styles.input} ${styles.datetimeInput}`}
                type="datetime-local"
                value={scheduledFor}
                disabled={composeBusy}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </label>
          )}

          <div className={styles.field}>
            <div className={styles.fieldLabel}>{t("mail.message")}</div>
            <ComposeEditor
              valueHtml={composeDraft.body}
              onChangeHtml={(next) => setComposeDraft((prev) => ({ ...prev, body: next }))}
              onInlineImage={({ cid, file }) => setInlineImagesByCid((prev) => ({ ...prev, [cid]: file }))}
              placeholder={t("mail.writeMessagePlaceholderLong")}
            />
          </div>

          <input
            ref={attachmentsInputRef as RefObject<HTMLInputElement>}
            className={styles.attachmentsInput}
            type="file"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length === 0) return;
              setAttachments((prev) => [...prev, ...files]);
              e.currentTarget.value = "";
            }}
          />

          {attachments.length > 0 && (
            <div className={styles.attachmentsSection} aria-label={t("mail.attachments")}>
              <div className={styles.attachmentsHeader}>{t("mail.attachments")}</div>
              <div className={styles.attachmentChips}>
                {attachments.map((f, idx) => (
                  <div key={`${f.name}-${f.size}-${idx}`} className={styles.attachmentChipCompose}>
                    <Paperclip className={styles.icon} aria-hidden="true" />
                    <span className={styles.attachmentChipName} title={f.name}>
                      {f.name}
                    </span>
                    <button
                      type="button"
                      className={styles.attachmentRemove}
                      aria-label={t("common.removeName", { name: f.name })}
                      title={t("common.remove")}
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <X className={styles.icon} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <div className={styles.modalFooterLeft}>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={composeBusy}
              onClick={() => {
                if (isComposeDirty) setComposeCancelConfirmOpen(true);
                else onDiscard();
              }}
            >
              {t("common.cancel")}
            </button>
            <button
              className={styles.secondaryButton}
              type="button"
              title={t("mail.attachFile")}
              aria-label={t("mail.attachFile")}
              disabled={composeBusy}
              onClick={() => attachmentsInputRef.current?.click()}
            >
              <Paperclip className={styles.icon} aria-hidden="true" />
            </button>
          </div>

          <div className={styles.modalFooterRight}>
            <div ref={sendMenuRef as RefObject<HTMLDivElement>} className={styles.splitButton}>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={composeBusy}
                onClick={() => void onSend()}
              >
                {composeBusy ? t("mail.sending") : scheduleEnabled ? t("mail.scheduleSend") : t("mail.send")}
              </button>
              <button
                className={styles.splitToggle}
                type="button"
                aria-haspopup="menu"
                aria-expanded={sendMenuOpen}
                aria-label={t("mail.moreSendOptions")}
                title={t("mail.moreSendOptions")}
                disabled={composeBusy}
                onClick={() => setSendMenuOpen(!sendMenuOpen)}
              >
                <ChevronDown className={styles.icon} aria-hidden="true" />
              </button>

              {sendMenuOpen && (
                <div className={styles.sendMenu} role="menu" aria-label={t("mail.sendOptions")}>
                  <button
                    className={styles.sendMenuItem}
                    type="button"
                    role="menuitem"
                    disabled={composeBusy}
                    onClick={() => {
                      const run = async () => {
                        setSendMenuOpen(false);
                        await onSaveDraft();
                      };
                      void run();
                    }}
                  >
                    <span className={styles.sendMenuItemRow}>
                      <Save className={styles.icon} aria-hidden="true" />
                      {composeBusy ? t("mail.saving") : t("mail.saveAsDraft")}
                    </span>
                  </button>
                  {scheduleEnabled && (
                    <button
                      className={styles.sendMenuItem}
                      type="button"
                      role="menuitem"
                      disabled={composeBusy}
                      onClick={() => {
                        setScheduleEnabled(false);
                        setScheduledFor("");
                        setSendMenuOpen(false);
                      }}
                    >
                      <span className={styles.sendMenuItemRow}>
                        <Mail className={styles.icon} aria-hidden="true" />
                        Send now
                      </span>
                    </button>
                  )}
                  {scheduleEnabled ? (
                    <button
                      className={styles.sendMenuItem}
                      type="button"
                      role="menuitem"
                      disabled={composeBusy}
                      onClick={onOpenSchedulePicker}
                    >
                      <span className={styles.sendMenuItemRow}>
                        <Clock className={styles.icon} aria-hidden="true" />
                        Change schedule
                      </span>
                    </button>
                  ) : (
                    <button
                      className={styles.sendMenuItem}
                      type="button"
                      role="menuitem"
                      disabled={composeBusy}
                      onClick={() => {
                        setScheduleEnabled(true);
                        onOpenSchedulePicker();
                      }}
                    >
                      <span className={styles.sendMenuItemRow}>
                        <Clock className={styles.icon} aria-hidden="true" />
                        {t("mail.scheduleDelivery")}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

