import { avatarInitials } from "@/lib/teacher-avatar";

type Props = {
  name: string | null | undefined;
  email?: string | null;
  avatarUrl: string | null | undefined;
  /** xs 1.5rem (top bar), sm 2rem, md 3rem, lg 4rem. */
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
};

/**
 * A teacher's photo, or their initials on the brand gradient when they have none.
 * Decorative by default: the name is always written next to it by the caller.
 */
export function TeacherAvatar({ name, email, avatarUrl, size = "sm", className }: Props) {
  return (
    <span className={`tp-avatar tp-avatar--${size} ${className ?? ""}`.trim()} aria-hidden data-testid="teacher-avatar">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
        <img src={avatarUrl} alt="" className="tp-avatar__img" />
      ) : (
        avatarInitials(name, email)
      )}
    </span>
  );
}
