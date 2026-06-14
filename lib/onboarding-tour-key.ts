/**
 * Transient handoff flag (sessionStorage) telling the form builder to run the
 * second segment of the first-login tour. Kept in its own module so callers can
 * read it without importing driver.js into the main bundle.
 */
export const BUILDER_TOUR_PENDING_KEY = "tp_onboarding_builder_pending";
