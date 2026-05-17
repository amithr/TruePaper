export type SuspendedStudentRow = {
  anonymousSessionId: string;
  displayName: string;
  suspendedAt: string;
};

export type TeacherSessionSummary = {
  id: string;
  formId: string;
  formTitle: string;
  joinCode: string;
  opensAt: string;
  closesAt: string;
  createdAt: string;
  /** Devices with a row for this live session (joined / presence / any activity). */
  assignedCount: number;
  /** Devices actively engaged while the session window is open: recent pointer/hover/move or typing (see LIVE_INTERACTION_IDLE_MS). */
  inProgressCount: number;
  /** Devices that have submitted (finished_at set). */
  finishedCount: number;
  /** @deprecated alias for assignedCount */
  responseCount: number;
};
