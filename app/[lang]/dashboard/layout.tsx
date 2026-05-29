import { notFound, redirect } from "next/navigation";

import { TeacherSessionProvider } from "@/components/TeacherSessionProvider";
import { toClientSessionData } from "@/lib/client-session";
import { getCachedRequestSession } from "@/lib/cached-request-session";
import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-dynamic";

type Props = {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
};

export default async function DashboardLayout({ children, params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }

  const auth = await getCachedRequestSession();

  if (!auth?.user) {
    redirect(`/${lang}/login`);
  }

  if (!auth.profile || auth.profile.role !== "teacher") {
    redirect(`/${lang}`);
  }

  const session = toClientSessionData(auth);

  return <TeacherSessionProvider session={session}>{children}</TeacherSessionProvider>;
}
