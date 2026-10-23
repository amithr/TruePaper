import { NextResponse } from "next/server";

export const MOVED_DEVICE_ERROR_FRAGMENT = "exam moved to another device";
export const MOVED_DEVICE_CODE = "moved_to_another_device";

/**
 * After a teacher approves a device rejoin, writes from the old device raise
 * `exam moved to another device`. 410 is final: the offline sync queue drops the
 * row instead of retrying (see lib/offline/sync-transport.ts) and the client shows
 * the "continued on another device" screen.
 */
export function movedDeviceErrorResponse(error: { message: string }): NextResponse | null {
  if (!error.message.includes(MOVED_DEVICE_ERROR_FRAGMENT)) {
    return null;
  }
  return NextResponse.json(
    { error: "This exam continued on another device.", code: MOVED_DEVICE_CODE },
    { status: 410 },
  );
}
