import { useEffect, useRef } from "react";
import type { Language, Origin } from "../shared/contracts";
import { Navigation } from "./Navigation";
export function NavigationDialog({
  toiletId,
  origin,
  language,
  onClose,
}: {
  toiletId: string;
  origin: Origin | null;
  language: Language;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const zh = language === "zh-CN";
  return (
    <dialog
      ref={dialog}
      className="place-dialog navigation-dialog"
      onCancel={onClose}
    >
      <div className="navigation-dialog-close">
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={zh ? "关闭导航" : "Close navigation"}
        >
          ×
        </button>
      </div>
      <Navigation toiletId={toiletId} origin={origin} language={language} />
    </dialog>
  );
}
