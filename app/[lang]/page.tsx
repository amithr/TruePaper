import HomeClient from "./HomeClient";
import { readClientSessionForPage } from "@/lib/cached-request-session";
import type { ClientSessionData } from "@/lib/client-session";

// Force dynamic so the per-request session is always fresh. Without this,
// Next.js would try to statically pre-render `/[lang]` and serve a stale
// (guest) session HTML to logged-in users.
export const dynamic = "force-dynamic";

async function readInitialSession(): Promise<ClientSessionData | null> {
  return readClientSessionForPage();
}

/**
 * Server entry for `/[lang]`. Resolves the auth session once on the server and
 * hands it to the (much heavier) client component as a prop, so the client
 * never has to make its own `/api/auth/session` round trip before painting.
 */
export default async function HomePage() {
  const initialSession = await readInitialSession();
  return <HomeClient initialSession={initialSession} />;
}
