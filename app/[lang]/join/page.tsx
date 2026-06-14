import HomeClient from "../HomeClient";

/**
 * Static student join shell. Session hydrates client-side when needed (e.g.
 * teachers previewing the student join flow).
 */
export default function JoinPage() {
  return <HomeClient initialSession={null} guestView="join" />;
}
