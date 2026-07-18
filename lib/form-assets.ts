/** Supabase Storage bucket for teacher-authored form/question images. */
export const FORM_ASSETS_BUCKET = "form-assets";

const MAX_ASSET_BYTES = 2 * 1024 * 1024;

export function formAssetPublicUrl(path: string | null | undefined): string | null {
  if (!path || typeof path !== "string") {
    return null;
  }
  const trimmed = path.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.startsWith("/")) {
    return null;
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!base) {
    return null;
  }
  return `${base}/storage/v1/object/public/${FORM_ASSETS_BUCKET}/${trimmed}`;
}

export function formDescriptionAssetPath(userId: string, formId: string): string {
  return `${userId}/${formId}/description.jpg`;
}

export function formQuestionAssetPath(
  userId: string,
  formId: string,
  questionId: string,
): string {
  return `${userId}/${formId}/q-${questionId}.jpg`;
}

export function isAllowedFormAssetMime(mime: string): boolean {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
}

export function assertFormAssetSize(byteLength: number): void {
  if (byteLength <= 0 || byteLength > MAX_ASSET_BYTES) {
    throw new Error("Image must be between 1 byte and 2 MB.");
  }
}

/** Convert a canvas data URL to a Blob for multipart upload. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) {
    throw new Error("Invalid image data.");
  }
  const meta = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mimeMatch = /data:(.*?);/.exec(meta);
  const mime = mimeMatch?.[1] ?? "image/jpeg";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}
