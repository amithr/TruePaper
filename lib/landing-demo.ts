/**
 * Landing-page demo timeline: everything on the stage is derived from one clock
 * `t` (ms, looping), so the component only renders — no CSS keyframe choreography.
 * Copy that varies by state is returned as keys; the component translates them.
 */

export const DEMO_LOOP_MS = 26_000;
/** Start of each caption chapter (seek targets for the chips). */
export const DEMO_CHAPTER_STARTS = [0, 1700, 3500, 9000, 14500, 17000] as const;
/** Frame shown when reduced motion is requested: mid "watch them write". */
export const DEMO_STILL_T = 8300;

/** A valid join code (Crockford base32: no I, O, U, 0 or 1), so it isn't misleading. */
export const DEMO_JOIN_CODE = "MKT294";

export type DemoOutage = "wifi" | "power" | "none";

export type DemoScreen = "join" | "exam" | "dark" | "done";
export type DemoSync = "saved" | "saving" | "reconnect" | "syncing";
export type DemoPill = "joined" | "typing" | "working" | "offline" | "submitted";

export type DemoFrame = {
  codeChars: { ch: string; shown: boolean }[];
  timer: string;
  clock: string;
  screen: DemoScreen;
  /** Ava's row on the teacher roster (collapsed until she joins). */
  avaJoined: boolean;
  rosterCount: number;
  avaPill: DemoPill;
  avaStatus: "workingQ1" | "offline" | "handedIn" | null;
  /** What the teacher sees of Ava's answer (lags; frozen while offline). */
  mirrorText: string;
  mirrorStale: boolean;
  needsCheck: boolean;
  nameTyped: string;
  nameFocused: boolean;
  joinPressed: boolean;
  offline: boolean;
  battery: "high" | "low" | "empty";
  sync: DemoSync;
  queued: number;
  answerText: string;
  answerFocused: boolean;
  questionSaved: boolean;
  restoredToast: boolean;
  feedbackVisible: boolean;
  handInPressed: boolean;
  allAnswered: boolean;
  activeChapter: number;
};

const ANSWER_1 = "Plants trap sunlight";
const ANSWER_2 = " and use chlorophyll to turn it into sugar.";

const progress = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const typed = (s: string, p: number) => s.slice(0, Math.round(s.length * p));

export function demoFrame(rawT: number, outage: DemoOutage): DemoFrame {
  const t = ((rawT % DEMO_LOOP_MS) + DEMO_LOOP_MS) % DEMO_LOOP_MS;
  const hasOutage = outage !== "none";
  const power = outage === "power";
  const secondStart = power ? 12_000 : 9_800;

  const codeShown = Math.floor(progress(t, 200, 1600) * 6 + 1e-6);
  const codeChars = DEMO_JOIN_CODE.split("").map((ch, i) => ({ ch, shown: i < codeShown }));

  const inExam = t >= 3400;
  const submitted = t >= 21_500;
  const dark = power && t >= 9000 && t < 10_800;
  const offline = hasOutage && t >= 9000 && t < 14_500;
  const resyncing = hasOutage && t >= 14_500 && t < 15_800;
  const typing1 = t > 4000 && t < 7500;
  const typing2 = t > secondStart && t < 13_500;
  const typingNow = typing1 || typing2;

  const answer1 = inExam ? typed(ANSWER_1, progress(t, 4000, 7500)) : "";
  const answer2 = t >= secondStart ? typed(ANSWER_2, progress(t, secondStart, 13_500)) : "";
  const answerText = answer1 + answer2;

  const queued = offline
    ? Math.min(3, Math.ceil(progress(t, secondStart, 13_500) * 3))
    : resyncing
      ? 3 - Math.floor(progress(t, 14_500, 15_800) * 3)
      : 0;

  const sync: DemoSync = offline
    ? "reconnect"
    : resyncing
      ? "syncing"
      : typingNow || (t > 7500 && t < 8300) || (!hasOutage && t > 13_500 && t < 14_300)
        ? "saving"
        : "saved";

  // The teacher's mirror trails the student by ~400 ms and freezes during the outage.
  const mirrorLagged = typed(ANSWER_1, progress(t, 4400, 7900));
  const mirrorText = !inExam
    ? ""
    : hasOutage && t < 15_200
      ? mirrorLagged
      : !hasOutage
        ? typed(ANSWER_1 + ANSWER_2, progress(t, 4400, 13_900))
        : answerText;
  const rosterOffline = offline || (hasOutage && t >= 14_500 && t < 15_200);

  let avaPill: DemoPill = "joined";
  let avaStatus: DemoFrame["avaStatus"] = null;
  if (inExam) {
    if (submitted) {
      avaPill = "submitted";
      avaStatus = "handedIn";
    } else if (rosterOffline) {
      avaPill = "offline";
      avaStatus = "offline";
    } else {
      avaPill = typingNow ? "typing" : "working";
      avaStatus = "workingQ1";
    }
  }

  const secs = 44 * 60 + 58 - Math.floor(t / 1000);
  const timer = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const activeChapter = DEMO_CHAPTER_STARTS.reduce<number>(
    (acc, start, i) => (t >= start ? i : acc),
    0,
  );

  return {
    codeChars,
    timer,
    clock: `10:${42 + Math.floor(t / 60_000)}`,
    screen: submitted ? "done" : dark ? "dark" : inExam ? "exam" : "join",
    avaJoined: inExam,
    rosterCount: inExam ? 3 : 2,
    avaPill,
    avaStatus,
    mirrorText,
    mirrorStale: rosterOffline && inExam,
    needsCheck: rosterOffline,
    nameTyped: typed("Ava", progress(t, 1900, 2600)),
    nameFocused: t > 1900 && t < 3300,
    joinPressed: t > 2900 && t < 3400,
    offline,
    battery: power && t >= 7000 && t < 9000 ? "low" : dark ? "empty" : "high",
    sync,
    queued,
    answerText,
    answerFocused: typingNow,
    questionSaved: sync === "saved" && t > 7500,
    restoredToast: power && t >= 10_800 && t < 13_200,
    feedbackVisible: t >= 17_300 && !submitted,
    handInPressed: t >= 20_800 && t < 21_500,
    allAnswered: t >= 4300,
    activeChapter,
  };
}
