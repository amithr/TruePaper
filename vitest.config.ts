import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e/**"],
    coverage: {
      provider: "v8",
      include: [
        "lib/offline/sync-*.ts",
        "lib/offline/answer-store.ts",
        "lib/offline/delivery-mode.ts",
        "lib/offline/heartbeat-meta.ts",
        "lib/offline/session-cache.ts",
        "lib/offline/sw-bypass.ts",
        "lib/offline/air-alert.ts",
        "lib/participant-status.ts",
        "lib/participant-display.ts",
        "lib/password-policy.ts",
        "lib/response-types/answers.ts",
        "lib/response-types/autograde.ts",
        "lib/response-types/registry.ts",
        "lib/collect-student-exam-answers.ts",
        "lib/exam-grades.ts",
        "lib/student-exam-answer-hydration.ts",
        "lib/student-exam-realtime-filter.ts",
        "lib/live-typing-preview.ts",
        "lib/count-answered-questions.ts",
        "lib/realtime-channels.ts",
        "lib/library/snapshots.ts",
        "lib/library/mappers.ts",
        "lib/library/cache.ts",
        "lib/home-url-intent.ts",
        "lib/session-countdown.ts",
        "lib/exam-pdf.ts",
      ],
      exclude: ["lib/**/*.test.ts", "lib/test/**"],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 45,
        statements: 50,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
