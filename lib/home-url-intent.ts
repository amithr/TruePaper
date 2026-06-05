export type TeacherHomeIntent = "builder" | "join" | "none";

type UrlParts = {
  search: string;
  hash: string;
};

function resolveUrlParts(parts?: UrlParts): UrlParts | null {
  if (parts) {
    return parts;
  }
  if (typeof window === "undefined") {
    return null;
  }
  return { search: window.location.search, hash: window.location.hash };
}

/** Infer teacher home routing from URL query/hash (builder vs join flow). */
export function readTeacherHomeIntent(parts?: UrlParts): TeacherHomeIntent {
  const url = resolveUrlParts(parts);
  if (!url) {
    return "none";
  }
  const params = new URLSearchParams(url.search);
  if (params.get("form")?.trim()) {
    return "builder";
  }
  if (params.has("code") || params.has("join") || params.has("resume")) {
    return "join";
  }
  if (params.get("new") === "1" || params.has("student")) {
    return "join";
  }
  if (url.hash === "#join-session" || url.hash.startsWith("#join-session")) {
    return "join";
  }
  return "none";
}

/** Read `form` query param for pending builder restore. */
export function readFormIdFromUrl(parts?: Pick<UrlParts, "search">): string {
  const search = parts?.search ?? (typeof window !== "undefined" ? window.location.search : "");
  if (!search) {
    return "";
  }
  return new URLSearchParams(search).get("form")?.trim() ?? "";
}
