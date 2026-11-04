import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { css, keyframes } from "@emotion/react";
import { useI18n } from "@/i18n";

type ModalProps = {
  children?: ReactNode;
  onClose: () => void;
  label: string;
  isOpen?: boolean;
};

const enter = keyframes`
  from { transform: translateY(-8px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
`;

/** Native top-layer modality keeps the underlying map/canvas inert, traps
 * keyboard focus and restores the opener when the controlled dialog closes.
 * No delayed close timer can dismiss a newly reopened dialog.
 */
export function Modal({ children, onClose, label, isOpen = false }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      aria-modal="true"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        // Some native-dialog implementations tab to browser chrome after the
        // last action. Explicitly cycle the visible, enabled controls instead.
        const actions = [...event.currentTarget.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]'
        )].filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') &&
          element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
        const edge = event.shiftKey ? actions[0] : actions[actions.length - 1];
        if (document.activeElement === edge) {
          event.preventDefault();
          (event.shiftKey ? actions[actions.length - 1] : actions[0])?.focus();
        }
      }}
      onClick={(event) => {
        // A click in the native backdrop targets the dialog itself. Padding,
        // scrolling and clicks in its content must not dismiss it.
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right ||
            event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}
      css={css({
        margin: "auto",
        padding: 0,
        width: "min(36rem, calc(100vw - 2rem))",
        maxWidth: "none",
        maxHeight: "calc(100dvh - 2rem)",
        overflowY: "auto",
        boxSizing: "border-box",
        background: "#fff",
        color: "#25313d",
        border: "1px solid #d6dce2",
        borderRadius: "12px",
        boxShadow: "0 8px 40px rgba(0,0,0,.2)",
        "&[open]": { animation: `${enter} .15s ease-out` },
        "&::backdrop": { background: "rgba(0,0,0,.35)", backdropFilter: "blur(2px)" },
      })}
    >
      <div css={css({ padding: "1.25rem", overflowWrap: "anywhere" })}>
        <div css={css({ display: "flex", justifyContent: "flex-end", marginBottom: "0.25rem" })}>
          <button type="button" onClick={onClose} aria-label={t("closeDialog")}
            css={css({ minWidth: 44, minHeight: 44, border: "1px solid #c3ccd5", borderRadius: 8,
              background: "#f8fafc", color: "#25313d", fontSize: "24px", cursor: "pointer" })}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
