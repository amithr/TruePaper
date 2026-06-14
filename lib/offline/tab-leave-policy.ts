import type { DeliveryMode } from "@/lib/offline/config";
import {
  TAB_LEAVE_GRACE_FLEX_MS,
  TAB_LEAVE_GRACE_LIVE_MS,
} from "@/lib/offline/config";

/** Tab-leave suspension applies only in live delivery (exam integrity). */
export function tabLeaveSuspensionEnabled(deliveryMode: DeliveryMode): boolean {
  return deliveryMode === "live";
}

export function tabLeaveGraceMs(deliveryMode: DeliveryMode): number {
  if (deliveryMode === "self_paced" || deliveryMode === "hybrid") {
    return TAB_LEAVE_GRACE_FLEX_MS;
  }
  return TAB_LEAVE_GRACE_LIVE_MS;
}

export function tabLeaveBlurGraceMs(deliveryMode: DeliveryMode): number {
  return tabLeaveGraceMs(deliveryMode) + 2_000;
}
