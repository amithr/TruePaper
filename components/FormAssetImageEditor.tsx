"use client";

import { useRef, useState } from "react";

import { FormAssetImage } from "@/components/FormAssetImage";
import { dataUrlToBlob } from "@/lib/form-assets";
import { compressImageFile } from "@/lib/image-compress";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import { focusRing } from "@/lib/ui";

type Props = {
  formId: string;
  /** `"description"` or a question UUID. */
  target: "description" | string;
  imagePath: string | null;
  onPathChange: (path: string | null) => void;
  disabled?: boolean;
};

export function FormAssetImageEditor({
  formId,
  target,
  imagePath,
  onPathChange,
  disabled = false,
}: Props) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File | undefined) => {
    if (!file || disabled) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const compressed = await compressImageFile(file, { maxDimension: 1280, quality: 0.8 });
      const blob = dataUrlToBlob(compressed.dataUrl);
      const body = new FormData();
      body.set("target", target);
      body.set("file", new File([blob], "image.jpg", { type: blob.type || "image/jpeg" }));

      const res = await fetch(`/api/forms/${formId}/assets`, {
        method: "POST",
        body,
      });
      const data = (await res.json()) as { path?: string; error?: string };
      if (!res.ok || !data.path) {
        throw new Error(data.error ?? t("home.builder.imageUploadError"));
      }
      onPathChange(data.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("home.builder.imageUploadError"));
    } finally {
      setBusy(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const handleRemove = async () => {
    if (disabled || busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/forms/${formId}/assets?target=${encodeURIComponent(target)}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? t("home.builder.imageRemoveError"));
      }
      onPathChange(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("home.builder.imageRemoveError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="form-asset-image-editor">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className={`tp-btn-secondary min-h-10 px-3 text-sm ${focusRing}`}
        >
          {busy
            ? t("common.saving")
            : imagePath
              ? t("home.builder.replaceImage")
              : t("home.builder.addImage")}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="sr-only"
          disabled={disabled || busy}
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        {imagePath ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void handleRemove()}
            className={`tp-btn-ghost min-h-10 px-3 text-sm ${focusRing}`}
          >
            {t("home.builder.removeImage")}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-[var(--tp-warning-text)]">{error}</p> : null}
      <FormAssetImage path={imagePath} alt={t("home.builder.imageAlt")} />
    </div>
  );
}
