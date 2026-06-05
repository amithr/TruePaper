export type LegalSection = {
  id: string;
  title: string;
  paragraphs: string[];
};

export type LegalDocumentContent = {
  title: string;
  summary: string;
  sections: LegalSection[];
};

export type LegalSlug = "privacy" | "terms" | "cookies";
