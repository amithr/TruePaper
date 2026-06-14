import HomeClient from "./HomeClient";

/**
 * Static marketing / builder shell. Auth is hydrated on the client when a
 * Supabase cookie is present (`useClientSessionHydration`). Teachers opening
 * plain `/[lang]` are redirected to the dashboard in `proxy.ts` before RSC.
 */
export default function HomePage() {
  return <HomeClient initialSession={null} />;
}
