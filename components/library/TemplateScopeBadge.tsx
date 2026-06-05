import type { TemplateScope } from "@/lib/library/types";
import { useTranslations } from "@/lib/i18n/I18nProvider";

const SCOPE_CLASS: Record<TemplateScope, string> = {
  private: "tp-scope-badge--private",
  department: "tp-scope-badge--department",
  school: "tp-scope-badge--school",
  public: "tp-scope-badge--public",
};

type Props = {
  scope: TemplateScope;
};

export function TemplateScopeBadge({ scope }: Props) {
  const t = useTranslations();
  return (
    <span className={`tp-scope-badge ${SCOPE_CLASS[scope]}`}>
      {t(`templateLibrary.scope.${scope}`)}
    </span>
  );
}
