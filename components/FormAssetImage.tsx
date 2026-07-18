import { formAssetPublicUrl } from "@/lib/form-assets";

type Props = {
  path: string | null | undefined;
  alt: string;
  className?: string;
};

/** Renders a teacher-authored form/question image from its storage path. */
export function FormAssetImage({ path, alt, className }: Props) {
  const url = formAssetPublicUrl(path);
  if (!url) {
    return null;
  }

  return (
    <div
      className={
        className ??
        "overflow-hidden rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)] bg-white"
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- public storage URLs */}
      <img src={url} alt={alt} className="max-h-80 w-full object-contain" />
    </div>
  );
}
