"use client";

import { Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

import { useTranslations } from "@/lib/i18n/I18nProvider";
import { requestJson } from "@/lib/request-json";
import { isAllowedAvatarMime, MAX_AVATAR_BYTES } from "@/lib/teacher-avatar";
import { ui } from "@/lib/ui";

type Props = {
  initials: string;
  avatarUrl: string | null;
  onChange: (avatarUrl: string | null) => void;
  onError: (message: string) => void;
};

/** 5rem circle: initials fallback, click-or-drop to upload, Replace / Remove. */
export function AvatarUploader({ initials, avatarUrl, onChange, onError }: Props) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (file: File) => {
    if (!isAllowedAvatarMime(file.type) || file.size > MAX_AVATAR_BYTES) {
      onError(t("settings.profile.photoSpec"));
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await requestJson<{ ok: true; avatarUrl: string }>("/api/teacher/avatar", {
        method: "POST",
        body,
      });
      onChange(res.avatarUrl);
    } catch (e) {
      onError(e instanceof Error ? e.message : t("settings.profile.photoFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await requestJson<{ ok: true }>("/api/teacher/avatar", { method: "DELETE" });
      onChange(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : t("settings.profile.photoFailed"));
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void upload(file);
    }
  };

  return (
    <div className="tp-settings-photo">
      <button
        type="button"
        className="tp-settings-avatar"
        data-drag-over={dragOver ? "true" : undefined}
        aria-label={t("settings.profile.photoDropAria")}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        data-testid="settings-avatar"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL, not optimised
          <img src={avatarUrl} alt="" className="tp-settings-avatar__img" />
        ) : (
          <span className="tp-settings-avatar__initials">{initials}</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        data-testid="settings-avatar-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void upload(file);
          }
          event.target.value = "";
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-semibold">{t("settings.profile.photoTitle")}</p>
        <p className="mt-1 text-[0.8125rem] leading-snug text-[var(--tp-text-secondary)]">
          {t("settings.profile.photoHint")}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            className={ui.btnSecondary}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload aria-hidden className="h-4 w-4" />
            {avatarUrl ? t("settings.profile.photoReplace") : t("settings.profile.photoUpload")}
          </button>
          {avatarUrl ? (
            <button type="button" className={ui.btnGhost} disabled={busy} onClick={() => void remove()}>
              {t("settings.profile.photoRemove")}
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-[var(--tp-text-muted)]">{t("settings.profile.photoSpec")}</p>
      </div>
    </div>
  );
}
