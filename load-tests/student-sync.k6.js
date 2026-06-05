/**
 * k6 load test: student answer sync + teacher heartbeat patterns.
 *
 * Run (requires k6 installed):
 *   BASE_URL=http://localhost:3000 LIVE_SESSION_ID=<uuid> k6 run load-tests/student-sync.k6.js
 *
 * Targets: ~20k VUs at 2× stress with graceful degradation (tune stages below).
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const LIVE_SESSION_ID = __ENV.LIVE_SESSION_ID || "";

export const options = {
  scenarios: {
    student_sync: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 500 },
        { duration: "5m", target: 20000 },
        { duration: "2m", target: 40000 },
        { duration: "3m", target: 40000 },
        { duration: "2m", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<1000"],
    http_req_failed: ["rate<0.02"],
  },
};

function deviceId() {
  return uuidv4();
}

export default function studentTypingLoop() {
  if (!LIVE_SESSION_ID) {
    console.error("Set LIVE_SESSION_ID env var");
    return;
  }

  const device = deviceId();
  const displayName = `Load ${__VU}`;

  const putRes = http.put(
    `${BASE_URL}/api/public/live-sessions/${LIVE_SESSION_ID}/responses`,
    JSON.stringify({
      deviceId: device,
      displayName,
      answers: { demo: `answer-${__ITER}` },
      submissionId: uuidv4(),
    }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "put_response" } },
  );

  check(putRes, {
    "put ok or deduped": (r) => r.status === 200 || r.status === 400,
    "p95 budget": (r) => r.timings.duration < 1000,
  });

  http.post(
    `${BASE_URL}/api/public/live-sessions/${LIVE_SESSION_ID}/heartbeat`,
    JSON.stringify({
      deviceId: device,
      displayName,
      isTyping: true,
      interaction: true,
      pendingSyncCount: 0,
      syncState: "synced",
    }),
    { headers: { "Content-Type": "application/json" }, tags: { name: "heartbeat" } },
  );

  sleep(0.3 + Math.random() * 0.4);
}
