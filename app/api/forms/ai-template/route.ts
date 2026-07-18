import { AI_EXAM_TEMPLATE_FILENAME, buildAiExamGuideMarkdown } from "@/lib/ai-exam-import";

/**
 * Public download: Markdown guide teachers feed to ChatGPT/Claude to generate
 * an importable JSON exam. Contains no secrets.
 */
export function GET() {
  const body = buildAiExamGuideMarkdown();
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${AI_EXAM_TEMPLATE_FILENAME}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
