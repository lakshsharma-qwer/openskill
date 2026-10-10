import type { Phase, Roadmap, Task, TaskType, Week } from "./types";

/* Gemini output is untrusted: coerce every field into the shape the UI expects. */

const TASK_TYPES: TaskType[] = ["learn", "practice", "revise", "test", "project", "outreach", "review"];

const str = (v: unknown, d = "") => (typeof v === "string" ? v.trim() : v == null ? d : String(v));
const num = (v: unknown, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : d;
};
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const strs = (v: unknown) => arr(v).map((x) => str(x)).filter(Boolean);

let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function normalizeWeeks(raw: unknown): Week[] {
  return arr<Record<string, unknown>>(raw)
    .map((w) => ({
      week: Math.max(1, Math.round(num(w.week, 1))),
      phaseId: str(w.phaseId),
      focus: str(w.focus, "This week"),
      checkpoint: str(w.checkpoint),
      tasks: arr<Record<string, unknown>>(w.tasks)
        .map(
          (t): Task => ({
            id: uid(),
            title: str(t.title),
            detail: str(t.detail) || undefined,
            type: TASK_TYPES.includes(t.type as TaskType) ? (t.type as TaskType) : "learn",
            estMinutes: Math.max(5, Math.round(num(t.estMinutes, 30))),
            videoQuery: str(t.videoQuery) || undefined,
            day: Math.min(7, Math.max(1, Math.round(num(t.day, 1)))),
            done: false,
          }),
        )
        .filter((t) => t.title),
    }))
    .sort((a, b) => a.week - b.week)
    // Models sometimes split one week into several entries — merge them back together.
    .reduce<Week[]>((out, w) => {
      const prev = out[out.length - 1];
      if (prev && prev.week === w.week) prev.tasks.push(...w.tasks);
      else out.push(w);
      return out;
    }, []);
}

/**
 * Models are loose with time budgets: scale each day's task durations so the day uses
 * 85–100% of the user's available minutes (rounded to 5 min), never more.
 */
export function fitDailyLoad(weeks: Week[], minutesPerDay: number): Week[] {
  const low = minutesPerDay * 0.85;
  return weeks.map((w) => {
    const totals = new Map<number, number>();
    for (const t of w.tasks) totals.set(t.day, (totals.get(t.day) ?? 0) + t.estMinutes);
    return {
      ...w,
      tasks: w.tasks.map((t) => {
        const total = totals.get(t.day)!;
        const factor = total > minutesPerDay ? minutesPerDay / total : total < low ? minutesPerDay / total : 1;
        if (factor === 1 || t.done) return t;
        return { ...t, estMinutes: Math.max(5, Math.floor((t.estMinutes * factor) / 5) * 5) };
      }),
    };
  });
}

export function normalizeRoadmap(raw: Record<string, unknown>, minutesPerDay?: number): Roadmap {
  const phases: Phase[] = arr<Record<string, unknown>>(raw.phases).map((p, i) => ({
    id: str(p.id) || `p${i + 1}`,
    name: str(p.name, `Phase ${i + 1}`),
    startWeek: Math.round(num(p.startWeek, 1)),
    endWeek: Math.round(num(p.endWeek, num(p.startWeek, 1))),
    objective: str(p.objective),
    topics: arr<Record<string, unknown>>(p.topics)
      .map((t) => (typeof t === "string" ? { name: t, why: "" } : { name: str(t.name), why: str(t.why) }))
      .filter((t) => t.name),
    resources: arr<Record<string, unknown>>(p.resources)
      .map((r) => ({
        title: str(r.title),
        type: str(r.type, "website"),
        creator: str(r.creator) || undefined,
        searchQuery: str(r.searchQuery) || [str(r.title), str(r.creator)].filter(Boolean).join(" "),
        free: r.free !== false,
        why: str(r.why) || undefined,
      }))
      .filter((r) => r.title),
    practice: strs(p.practice),
    milestone: str(p.milestone),
    revision: str(p.revision),
  }));

  const parsed = normalizeWeeks(raw.weeks);
  const weeks = minutesPerDay ? fitDailyLoad(parsed, minutesPerDay) : parsed;
  const lastPhaseEnd = Math.max(0, ...phases.map((p) => p.endWeek));

  return {
    title: str(raw.title, "Your roadmap"),
    summary: str(raw.summary),
    searchContext: str(raw.searchContext) || undefined,
    realityCheck: str(raw.realityCheck),
    totalWeeks: Math.max(1, Math.round(num(raw.totalWeeks, lastPhaseEnd || 1))),
    strategy: strs(raw.strategy),
    phases,
    weeks,
    dailyRoutine: arr<Record<string, unknown>>(raw.dailyRoutine)
      .map((b) => ({ block: str(b.block), activity: str(b.activity), minutes: Math.round(num(b.minutes, 30)) }))
      .filter((b) => b.activity),
    revisionStrategy: str(raw.revisionStrategy),
    mockTestPlan: arr<Record<string, unknown>>(raw.mockTestPlan)
      .map((m) => ({ week: Math.round(num(m.week, 1)), what: str(m.what) }))
      .filter((m) => m.what),
    metrics: arr<Record<string, unknown>>(raw.metrics)
      .map((m) => ({ name: str(m.name), target: str(m.target) }))
      .filter((m) => m.name),
    startToday: strs(raw.startToday),
    pitfalls: strs(raw.pitfalls),
  };
}

/** How much of the timeline the phases cover (1 = all of it). */
export function phaseCoverage(r: Roadmap, totalWeeks: number) {
  const lastEnd = Math.max(0, ...r.phases.map((p) => p.endWeek));
  return totalWeeks ? lastEnd / totalWeeks : 1;
}

/**
 * Make phases span week 1 → totalWeeks exactly, in order, without gaps or overlaps.
 * Short or overlong plans are stretched/compressed proportionally, which keeps each phase's relative size.
 */
export function fitPhasesToTimeline(r: Roadmap, totalWeeks: number): Roadmap {
  const phases = [...r.phases].sort((a, b) => a.startWeek - b.startWeek);
  if (!phases.length || totalWeeks < 1) return r;
  const lastEnd = Math.max(1, ...phases.map((p) => p.endWeek));
  const f = totalWeeks / lastEnd;
  let prevEnd = 0;
  const fitted = phases.map((p, i) => {
    const isLast = i === phases.length - 1;
    // On very short timelines (more phases than weeks) later phases share the final week.
    const start = Math.min(prevEnd + 1, totalWeeks);
    const scaledEnd = Math.round(p.endWeek * f);
    // leave at least one week for each remaining phase when there's room
    const maxEnd = Math.max(start, totalWeeks - (phases.length - 1 - i));
    const end = isLast ? totalWeeks : Math.min(maxEnd, Math.max(start, scaledEnd));
    prevEnd = end;
    return { ...p, startWeek: start, endWeek: end };
  });
  return { ...r, phases: fitted, totalWeeks };
}

