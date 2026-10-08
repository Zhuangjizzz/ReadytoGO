import type {
  ApiFailure,
  ApiSuccess,
  Place,
  SearchRequest,
  SearchResult,
  Toilet,
} from "../shared/contracts";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiSuccess<T>> {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const body = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || "error" in body) {
    const error =
      "error" in body
        ? body.error
        : {
            code: "REQUEST_FAILED",
            message: "The request failed.",
            retryable: true,
          };
    throw new ApiError(
      error.code,
      error.message,
      error.retryable,
      response.status,
    );
  }
  return body;
}
export const searchPlaces = (
  q: string,
  language: string,
  signal?: AbortSignal,
) =>
  api<{ places: Place[]; hasMore: boolean }>(
    `/places/search?${new URLSearchParams({ q, language, city: "beijing" })}`,
    { signal },
  );
export const searchToilets = (request: SearchRequest, signal?: AbortSignal) =>
  api<SearchResult>("/toilets/search", {
    method: "POST",
    body: JSON.stringify(request),
    signal,
  });
export const getToilet = (id: string, language: string, signal?: AbortSignal) =>
  api<Toilet>(`/toilets/${encodeURIComponent(id)}?language=${language}`, {
    signal,
  });
