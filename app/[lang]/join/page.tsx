import HomeClient from "../HomeClient";
import { readClientSessionForPage } from "@/lib/cached-request-session";

export const dynamic = "force-dynamic";

/**
 * Student join entry point. Keeps the marketing homepage focused on teachers
 * while giving students a dedicated, low-distraction page.
 */
export default async function JoinPage() {
  const initialSession = await readClientSessionForPage();
  return <HomeClient initialSession={initialSession} guestView="join" />;
}
