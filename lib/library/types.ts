export type TemplateScope = "private" | "department" | "school" | "public";
export type TemplateSourceKind = "question" | "form" | "session";
export type TemplateLanguage = "en" | "uk";
export type OrgRole = "member" | "department_head" | "admin";

export type TemplateQuestionSnapshot = {
  prompt: string;
  type: string;
  options: string[];
  correctAnswer: string | null;
  points: number;
  displayOrder: number;
  responseConfig: Record<string, unknown>;
};

export type TemplateSnapshot = {
  title: string;
  description: string;
  liveTeacherFeedbackEnabled: boolean;
  questions: TemplateQuestionSnapshot[];
  sessionDefaults?: {
    durationMinutes?: number;
    noTimeLimit?: boolean;
  };
};

export type LibraryTemplateSummary = {
  id: string;
  title: string;
  description: string;
  sourceKind: TemplateSourceKind;
  scope: TemplateScope;
  language: TemplateLanguage;
  subject: string;
  gradeLevel: string;
  curriculumTags: string[];
  nmtDpaRelevant: boolean;
  interactionTypes: string[];
  currentVersionNumber: number;
  questionCount: number;
  authorId: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  updateAvailable?: boolean;
  clonedAtVersionNumber?: number;
};

export type LibraryTemplateDetail = LibraryTemplateSummary & {
  snapshot: TemplateSnapshot;
  changelog: string;
};

export type SaveTemplateInput = {
  title: string;
  description?: string;
  scope?: TemplateScope;
  language?: TemplateLanguage;
  subject?: string;
  gradeLevel?: string;
  curriculumTags?: string[];
  nmtDpaRelevant?: boolean;
  interactionTypes?: string[];
  changelog?: string;
};

export type LibraryBrowseFilters = {
  q?: string;
  scope?: TemplateScope | "mine" | "shared";
  subject?: string;
  gradeLevel?: string;
  language?: TemplateLanguage;
  nmtDpaRelevant?: boolean;
  interactionType?: string;
  sourceKind?: TemplateSourceKind;
  page?: number;
  pageSize?: number;
};

export type LibraryBrowseResult = {
  items: LibraryTemplateSummary[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type TeacherOrgProfile = {
  organizationId: string | null;
  organizationName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  orgRole: OrgRole;
};
