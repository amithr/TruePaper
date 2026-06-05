import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { I18nProvider } from "@/lib/i18n/I18nProvider";
import type { Dictionary } from "@/lib/i18n/types";
import en from "@/messages/en.json";

export function renderWithI18n(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nProvider locale="en" dict={en as Dictionary}>
        {children}
      </I18nProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...options });
}
