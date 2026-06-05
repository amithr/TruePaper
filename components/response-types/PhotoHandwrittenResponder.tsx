"use client";

import { useRef, useState } from "react";

import { compressImageFile } from "@/lib/image-compress";
import { useTranslations } from "@/lib/i18n/I18nProvider";
import type { PhotoHandwrittenConfig } from "@/lib/response-types/types";
import { focusRing } from "@/lib/ui";

type Props = {
  imageDataUrl: string;
  width: number;
  height: number;
  disabled: boolean;
  config: PhotoHandwrittenConfig;
  onChange: (imageDataUrl: string, width: number, height: number) => void;
};

export function PhotoHandwrittenResponder({
  imageDataUrl,
  width,
  height,
  disabled,
  config,
  onChange,
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
      const result = await compressImageFile(file, {
        maxDimension: config.maxDimension ?? 960,
      });
      onChange(result.dataUrl, result.width, result.height);
    } catch {
      setError(t("responseTypes.photoHandwritten.uploadError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="student-photo-upload">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className={`tp-btn-secondary min-h-11 px-4 text-sm ${focusRing}`}
        >
          {busy ? t("common.saving") : t("responseTypes.photoHandwritten.upload")}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={disabled || busy}
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        {imageDataUrl ? (
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => onChange("", 0, 0)}
            className={`tp-btn-ghost min-h-11 px-3 text-sm ${focusRing}`}
          >
            {t("responseTypes.photoHandwritten.remove")}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-[var(--tp-warning-text)]">{error}</p> : null}
      {imageDataUrl ? (
        <div className="overflow-hidden rounded-[var(--tp-radius-sm)] border border-[var(--tp-border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageDataUrl}
            alt={t("responseTypes.photoHandwritten.previewAlt")}
            className="max-h-[480px] w-full object-contain bg-white"
          />
        </div>
      ) : (
        <p className="rounded-[var(--tp-radius-sm)] border border-dashed border-[var(--tp-border)] px-4 py-8 text-center text-sm text-[var(--tp-text-secondary)]">
          {t("responseTypes.photoHandwritten.empty")}
        </p>
      )}
      {imageDataUrl && width > 0 && height > 0 ? (
        <p className="text-xs text-[var(--tp-text-muted)]">
          {t("responseTypes.photoHandwritten.dimensions", { width, height })}
        </p>
      ) : null}
    </div>
  );
}
