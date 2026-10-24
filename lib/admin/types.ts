import type { PlanId } from "@/lib/billing/plans";

export type AdminOverview = {
  billingEnabled: boolean;
  users: number;
  teachers: number;
  admins: number;
  paid: number;
  forms: number;
  sessions: number;
  sessionsLast7Days: number;
  submissions: number;
};

export type AdminUserRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: "teacher" | "student";
  isAdmin: boolean;
  planOverride: PlanId | null;
  createdAt: string;
  lastSignInAt: string | null;
  billingPlan: string | null;
  billingStatus: string | null;
  formsCount: number;
  sessionsCount: number;
  lastSessionAt: string | null;
};

export type AdminUserDetail = {
  profile: AdminUserRow & { onboardingTourCompletedAt: string | null };
  billing: {
    plan: string;
    status: string;
    studentLimit: number | null;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    updatedAt: string;
  } | null;
  forms: { id: string; title: string; createdAt: string; questionCount: number; sessionsCount: number }[];
  sessions: {
    id: string;
    joinCode: string;
    opensAt: string;
    closesAt: string;
    createdAt: string;
    formTitle: string | null;
    participants: number;
    submitted: number;
  }[];
};
