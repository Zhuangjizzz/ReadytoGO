import type { Language, PlanStop } from "../shared/contracts";

export function PlanNote({
  note,
  noteKind,
  language,
  className,
}: {
  note?: string;
  noteKind?: PlanStop["noteKind"];
  language: Language;
  className?: string;
}) {
  if (!note) return null;
  if (noteKind !== "source_context") return <p className={className}>{note}</p>;
  return (
    <details className={`plan-note ${className ?? ""}`}>
      <summary>
        {language === "zh-CN"
          ? "原文上下文，可能包含多站，请核对"
          : "Original context may cover multiple stops. Please check."}
      </summary>
      <p>{note}</p>
    </details>
  );
}
