import { notFound } from "next/navigation";

import { ClassReviewPresentation } from "@/components/review/ClassReviewPresentation";
import { getCachedRequestSession } from "@/lib/cached-request-session";
import { isLocale } from "@/lib/i18n/config";

type Props = {
  params: Promise<{ lang: string; liveSessionId: string }>;
};

/** Projector mode: walk the class through the paper. Teacher-only (it carries answer keys). */
export default async function ClassReviewPage({ params }: Props) {
  const { lang, liveSessionId } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const auth = await getCachedRequestSession();
  if (!auth?.user || auth.profile?.role !== "teacher") {
    notFound();
  }
  return <ClassReviewPresentation liveSessionId={liveSessionId} />;
}
