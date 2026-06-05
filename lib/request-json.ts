type ApiError = { error?: string };

/** fetch + JSON parse with a clear error when the server returns HTML (e.g. 404 page). */
export async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const snippet = (await response.text()).trim().slice(0, 80);
    if (response.status === 404) {
      throw new Error(
        "API route not found (server returned HTML). Restart `npm run dev` from the truepaper project folder.",
      );
    }
    throw new Error(
      `Expected JSON but got ${response.status} (${contentType || "unknown type"}). ${snippet}`,
    );
  }

  const data = (await response.json()) as T & ApiError;
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

/**
 * `requestJson` that aborts after `timeoutMs` so a hung/stalled server can never
 * freeze the caller indefinitely. On timeout the promise rejects with an
 * `AbortError`, letting callers show a "try again" message instead of hanging.
 */
export async function requestJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Honor a caller-supplied signal too: abort our request if theirs fires.
  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }
  try {
    return await requestJson<T>(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
