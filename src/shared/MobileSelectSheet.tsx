import { useEffect, useId, useMemo, useState } from "react";

import { ChevronDown } from "lucide-react";

import styles from "./MobileSelectSheet.module.css";

export type MobileSelectOption = { value: string; label: string };

type Props = {
  id: string;
  title: string;
  value: string;
  options: readonly MobileSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

export default function MobileSelectSheet({ id, title, value, options, onChange, disabled }: Props) {
  const menuId = useId();
  const dialogId = `${menuId}-sheet`;

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const selectedLabel = useMemo(() => options.find((o) => o.value === value)?.label ?? value, [options, value]);

  return (
    <>
      <button
        id={id}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        title={selectedLabel}
        disabled={disabled}
      >
        <span className={styles.triggerValue}>{selectedLabel}</span>
        <ChevronDown className={styles.triggerChevron} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={dialogId}
          className={styles.sheetOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className={styles.sheet} role="document">
            <div className={styles.sheetHeader}>
              <div className={styles.sheetTitle}>{title}</div>
            </div>
            <div className={styles.sheetBody}>
              {options.map((opt) => {
                const active = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.option} ${active ? styles.optionActive : ""}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <span>{opt.label}</span>
                    {active ? (
                      <span className={styles.optionRight} aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}


