import type { SupabaseClient } from "@supabase/supabase-js";

import type { DeliveryMode } from "@/lib/offline/config";

export async function fetchSessionDeliveryMode(
  supabase: SupabaseClient,
  liveSessionId: string,
): Promise<DeliveryMode> {
  const { data, error } = await supabase
    .from("form_sessions")
    .select("delivery_mode")
    .eq("id", liveSessionId)
    .maybeSingle();

  if (error?.message?.includes("delivery_mode")) {
    return "live";
  }

  const mode = data?.delivery_mode as string | undefined;
  if (mode === "live" || mode === "self_paced" || mode === "hybrid") {
    return mode;
  }
  return "live";
}

export function sessionAllowsAnswerSync(
  sessionOpen: boolean,
  deliveryMode?: DeliveryMode,
): boolean {
  return sessionOpen || deliveryMode === "self_paced" || deliveryMode === "hybrid";
}
