import { notFound } from "next/navigation";

import { LegalDocument } from "@/components/legal/LegalDocument";
import { isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getLegalDocument } from "@/lib/legal/get-document";
import { ui } from "@/lib/ui";

type Props = {
  params: Promise<{ lang: string }>;
};

export default async function PrivacyPolicyPage({ params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const dict = await getDictionary(lang);
  const content = getLegalDocument(lang, "privacy");

  return (
    <main className={ui.page}>
      <div className={`${ui.pageMain} pb-16`}>
        <LegalDocument
          content={content}
          backLabel={dict.common.back}
          summaryLabel={dict.legal.summaryHeading}
        />
      </div>
    </main>
  );
}
