import { notFound } from "next/navigation";

import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { getCachedRequestSession } from "@/lib/cached-request-session";
import { isLocale } from "@/lib/i18n/config";

type Props = {
  params: Promise<{ lang: string }>;
};

/** Admins only; everyone else gets a 404 so the page's existence isn't advertised. */
export default async function AdminPage({ params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const auth = await getCachedRequestSession();
  if (!auth?.user || !auth.profile?.is_admin) {
    notFound();
  }
  return <AdminDashboard currentUserId={auth.user.id} />;
}
