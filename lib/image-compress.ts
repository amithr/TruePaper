const DEFAULT_MAX_DIMENSION = 960;
const DEFAULT_JPEG_QUALITY = 0.72;

export type CompressOptions = {
  maxDimension?: number;
  quality?: number;
  mimeType?: "image/jpeg" | "image/webp";
};

/** Downscale and re-encode an image file for mobile-friendly answer payloads. */
export async function compressImageFile(
  file: File,
  options: CompressOptions = {},
): Promise<{ dataUrl: string; width: number; height: number }> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY;
  const mimeType = options.mimeType ?? "image/jpeg";

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas not supported.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL(mimeType, quality);
  return { dataUrl, width, height };
}
