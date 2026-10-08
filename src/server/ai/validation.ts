import { z } from "zod";
import type { JsonRepair, ValidationIssue } from "../providers/qwen.js";

const outputPaths = new Set([
  "items",
  "toiletId",
  "seatInference",
  "basisFields",
  "reason",
  "recordId",
  "proposedPreference",
  "preferenceEvidence",
  "placeQueries",
  "order",
  "originalText",
  "queryZh",
  "note",
  "unsupportedNeeds",
  "warnings",
]);
export class OutputValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    super("AI_INVALID_OUTPUT");
  }
}
function boundedIssue(issue: ValidationIssue): ValidationIssue {
  return {
    path: issue.path
      .slice(0, 8)
      .map((part) =>
        typeof part === "number" && Number.isSafeInteger(part) && part >= 0
          ? Math.min(part, 10000)
          : typeof part === "string" && outputPaths.has(part)
            ? part
            : "unknown",
      ),
    category: issue.category,
    ...(issue.allowedValues
      ? {
          allowedValues: issue.allowedValues
            .slice(0, 32)
            .map((value) =>
              typeof value === "string" ? value.slice(0, 160) : value,
            ),
        }
      : {}),
    ...(issue.limit !== undefined && Number.isFinite(issue.limit)
      ? { limit: issue.limit }
      : {}),
  };
}
/** Never feed exception messages, provider text or unknown-key labels into instructions. */
export function repairFeedback(raw: string, error: unknown): JsonRepair {
  let issues: ValidationIssue[];
  if (error instanceof OutputValidationError) issues = error.issues;
  else if (error instanceof z.ZodError)
    issues = error.issues.map((issue) => {
      const path = issue.path.filter(
        (part): part is string | number =>
          typeof part === "string" || typeof part === "number",
      );
      switch (issue.code) {
        case "invalid_value":
          return {
            path,
            category: "invalid_enum",
            allowedValues: issue.values.filter(
              (value): value is string | number | boolean | null =>
                value === null ||
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean",
            ),
          };
        case "invalid_type":
          return { path, category: "invalid_type" };
        case "unrecognized_keys":
          return { path, category: "unexpected_field" };
        case "too_big":
          return { path, category: "too_large", limit: Number(issue.maximum) };
        case "too_small":
          return { path, category: "too_small", limit: Number(issue.minimum) };
        default:
          return { path, category: "invalid_shape" };
      }
    });
  else
    issues = [
      {
        path: [],
        category:
          error instanceof SyntaxError ? "invalid_json" : "invalid_output",
      },
    ];
  return {
    previousResponse: raw.slice(0, 12000),
    previousResponseTruncated: raw.length > 12000,
    validationIssues: issues.slice(0, 16).map(boundedIssue),
  };
}
