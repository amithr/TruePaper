/** Build a read-only student results URL (answers, points, teacher feedback). */
export function buildStudentReviewUrl(origin: string, reviewToken: string): string {
  const token = reviewToken.trim().toUpperCase();
  if (!origin || token.length < 8) {
    return "";
  }
  return `${origin.replace(/\/$/, "")}/review/${encodeURIComponent(token)}`;
}
