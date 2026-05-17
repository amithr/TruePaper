import { createHmac } from "node:crypto";

function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

/** Short-lived anon JWT so students can subscribe to their own form_responses row via Realtime. */
export function mintStudentRealtimeJwt(
  deviceId: string,
  jwtSecret: string,
  ttlSeconds = 8 * 60 * 60,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      role: "anon",
      iss: "supabase",
      iat: now,
      exp: now + ttlSeconds,
      device_id: deviceId.toLowerCase(),
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", jwtSecret).update(unsigned).digest();
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

export function getSupabaseJwtSecret(): string | null {
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  return secret || null;
}
