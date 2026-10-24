"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { ClientSessionData } from "@/lib/client-session";

const TeacherSessionContext = createContext<ClientSessionData | null>(null);

type Props = {
  session: ClientSessionData;
  children: ReactNode;
};

export function TeacherSessionProvider({ session, children }: Props) {
  return (
    <TeacherSessionContext.Provider value={session}>{children}</TeacherSessionContext.Provider>
  );
}

/** The session when rendered inside the dashboard layout, else null (never throws). */
export function useOptionalTeacherSession(): ClientSessionData | null {
  return useContext(TeacherSessionContext);
}

/** Teacher session from the dashboard server layout (no client `/api/auth/session`). */
export function useTeacherSession(): ClientSessionData {
  const session = useContext(TeacherSessionContext);
  if (!session) {
    throw new Error("useTeacherSession must be used within TeacherSessionProvider");
  }
  return session;
}
