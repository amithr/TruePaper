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
