import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { notFound } from "next/navigation";

import "../globals.css";

import { ConditionalSiteChrome } from "@/components/ConditionalSiteChrome";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";
import { TruepaperToaster } from "@/components/TruepaperToaster";
import { LOCALES, isLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Truepaper — Classroom forms & live sessions",
  description:
    "Teachers create forms and run live sessions; students join with a code—no account required.",
  manifest: "/manifest.json",
};

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

type Props = {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
};

export default async function LocaleRootLayout({ children, params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const dict = await getDictionary(lang);

  return (
    <html
      lang={lang}
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <I18nProvider locale={lang} dict={dict}>
          <div className="flex min-h-full flex-1 flex-col">
            {children}
            <ConditionalSiteChrome />
          </div>
          <TruepaperToaster />
          <ServiceWorkerRegistration />
        </I18nProvider>
      </body>
    </html>
  );
}
