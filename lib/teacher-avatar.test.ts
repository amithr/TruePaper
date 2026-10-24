import { describe, expect, it } from "vitest";

import { avatarInitials, avatarPublicUrl, avatarStoragePath, isAllowedAvatarMime } from "@/lib/teacher-avatar";

describe("teacher avatar helpers", () => {
  it("derives initials from the name, then the email", () => {
    expect(avatarInitials("Maria Rivera", "x@y")).toBe("MR");
    expect(avatarInitials("  ", "jordan.lee@school.edu")).toBe("JL");
    expect(avatarInitials(null, null)).toBe("T");
  });

  it("stores one object per teacher with the mime's extension", () => {
    expect(avatarStoragePath("u1", "image/png")).toBe("u1/avatar.png");
    expect(avatarStoragePath("u1", "image/jpeg")).toBe("u1/avatar.jpg");
    expect(isAllowedAvatarMime("image/gif")).toBe(false);
  });

  it("builds a cache-busted public URL and refuses path tricks", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co/";
    expect(avatarPublicUrl("u1/avatar.png", 7)).toBe(
      "https://x.supabase.co/storage/v1/object/public/avatars/u1/avatar.png?v=7",
    );
    expect(avatarPublicUrl("../u2/avatar.png", 7)).toBeNull();
  });
});
