/** Supabase Storage bucket for teacher profile photos (public read, owner write). */
export const AVATARS_BUCKET = "avatars";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isAllowedAvatarMime(mime: string): boolean {
  return mime in EXT_BY_MIME;
}

/** `{userId}/avatar.{ext}` — one object per teacher, replaced in place. */
export function avatarStoragePath(userId: string, mime: string): string {
  return `${userId}/avatar.${EXT_BY_MIME[mime] ?? "jpg"}`;
}

/** Public URL with a cache-buster so a replaced photo shows at once. */
export function avatarPublicUrl(path: string, version = Date.now()): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base || !path || path.includes("..") || path.startsWith("/")) {
    return null;
  }
  return `${base}/storage/v1/object/public/${AVATARS_BUCKET}/${path}?v=${version}`;
}

/** Initials for the gradient fallback: "Maria Rivera" → "MR", "jordan@x" → "J". */
export function avatarInitials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? "").trim() || (email ?? "").trim();
  const parts = source.split(/[\s.@_-]+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((p) => p[0]).join("");
  return initials ? initials.toUpperCase() : "T";
}
