"use client";

import { Toaster } from "sonner";

export function TruepaperToaster() {
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        style: {
          borderRadius: "14px",
          fontSize: "0.875rem",
        },
      }}
    />
  );
}
