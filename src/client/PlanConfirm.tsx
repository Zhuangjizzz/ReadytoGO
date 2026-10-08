import { useEffect, useRef, type ReactNode } from "react";
export function PlanConfirm({
  title,
  children,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="plan-confirm"
      aria-label={title}
      onCancel={onCancel}
    >
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
