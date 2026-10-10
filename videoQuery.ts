import type { Plan, Task } from "./types";

/** Words that tailor every search to this user (exam, language), e.g. "JEE hindi". */
export function searchContext(plan: Plan) {
  if (plan.roadmap.searchContext) return plan.roadmap.searchContext;
  return ["Hindi", "Hinglish"].includes(plan.profile.language) ? "hindi" : "";
}

function withContext(q: string, ctx: string) {
  const missing = ctx
    .split(/\s+/)
    .filter((w) => w && !q.toLowerCase().includes(w.toLowerCase()))
    .join(" ");
  return `${q} ${missing}`.trim();
}

export function topicQuery(topic: string, plan: Plan) {
  return withContext(topic, searchContext(plan));
}

/** A YouTube query for a task, or null when a video wouldn't help (tests, outreach…). */
export function taskQuery(task: Task, plan: Plan) {
  if (task.videoQuery) return withContext(task.videoQuery, searchContext(plan));
  if (task.type !== "learn" && task.type !== "revise") return null;
  const cleaned = task.title.replace(/^(video|watch|read|learn|revise|review)\s*[:\-–]?\s*/i, "");
  return withContext(cleaned, searchContext(plan));
}
