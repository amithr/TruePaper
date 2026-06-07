/**
 * Tab-switch pause may be applied locally before the server records it (e.g. offline).
 * Only lift the overlay once the server had confirmed suspension and later clears it
 * (teacher resume).
 */
export function shouldApplyTeacherExamResume(serverPauseConfirmed: boolean): boolean {
  return serverPauseConfirmed;
}
