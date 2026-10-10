import { streak, todayKey } from "./dates";
import type { GameState, Plan } from "./types";

/* XP rewards */
export const XP = { lesson: 15, perfectBonus: 5, practice: 15, checkpoint: 30, watch: 10, task: 10 } as const;

export const DAILY_GOALS = [
  { xp: 10, label: "Casual" },
  { xp: 20, label: "Regular" },
  { xp: 30, label: "Serious" },
  { xp: 50, label: "Intense" },
];

export function emptyGame(dailyGoal = 20): GameState {
  return { xp: 0, daily: {}, dailyGoal, nodes: {}, badges: [], mistakes: [] };
}

export function game(plan: Plan): GameState {
  return plan.game ?? emptyGame();
}

export function todayXp(g: GameState) {
  return g.daily[todayKey()] ?? 0;
}

/** Levels get gradually further apart: 0, 50, 150, 300, 500… XP. */
export function level(xp: number) {
  let lvl = 1;
  let need = 50;
  let floor = 0;
  while (xp >= floor + need) {
    floor += need;
    lvl++;
    need = 50 * lvl;
  }
  return { level: lvl, into: xp - floor, need };
}

/* ---------- The path ---------- */

export type NodeKind = "learn" | "watch" | "practice" | "checkpoint";

export interface PathNode {
  id: string;
  kind: NodeKind;
  title: string;
  topicIndex: number; // -1 for checkpoints
  xp: number;
}

export interface PathUnit {
  phaseId: string;
  index: number;
  name: string;
  objective: string;
  weeks: string;
  nodes: PathNode[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Units = roadmap phases; for each topic: learn → watch → practice; each unit ends in a checkpoint. */
export function buildPath(plan: Plan): PathUnit[] {
  return plan.roadmap.phases.map((ph, u) => ({
    phaseId: ph.id,
    index: u,
    name: ph.name,
    objective: ph.objective,
    weeks: `Weeks ${ph.startWeek}–${ph.endWeek}`,
    nodes: [
      ...ph.topics.flatMap((t, i): PathNode[] => {
        const base = `${ph.id}:${slug(t.name)}`;
        return [
          { id: `${base}:learn`, kind: "learn", title: t.name, topicIndex: i, xp: XP.lesson },
          { id: `${base}:watch`, kind: "watch", title: t.name, topicIndex: i, xp: XP.watch },
          { id: `${base}:practice`, kind: "practice", title: t.name, topicIndex: i, xp: XP.practice },
        ];
      }),
      { id: `${ph.id}:checkpoint`, kind: "checkpoint", title: `${ph.name} — unit test`, topicIndex: -1, xp: XP.checkpoint },
    ],
  }));
}

/** Video nodes are completed by marking the mentor's pick for that topic as watched. */
export function watchPickKey(phaseId: string, topicIndex: number) {
  return `topic:${phaseId}:${topicIndex}`;
}

export function isDone(plan: Plan, unit: PathUnit, node: PathNode) {
  if (node.kind === "watch") return !!plan.videoPicks?.[watchPickKey(unit.phaseId, node.topicIndex)]?.watched;
  return !!game(plan).nodes[node.id]?.done;
}

/** The first node not yet done, across all units. Everything after it is locked. */
export function currentNodeId(plan: Plan, units: PathUnit[]) {
  for (const u of units) for (const n of u.nodes) if (!isDone(plan, u, n)) return n.id;
  return null;
}

/* ---------- Rewards ---------- */

export interface Reward {
  plan: Plan;
  xp: number;
  newBadges: Badge[];
  streakExtended: boolean; // first XP of the day
  goalReached: boolean; // crossed the daily goal with this reward
}

/** Add XP (once per marker, when given) and update streak, daily goal and badges. */
export function award(plan: Plan, xp: number, marker?: string, extra?: (g: GameState) => GameState): Reward {
  const g0 = game(plan);
  if (marker && g0.nodes[marker]?.done) return { plan, xp: 0, newBadges: [], streakExtended: false, goalReached: false };
  const today = todayKey();
  const before = g0.daily[today] ?? 0;
  let g: GameState = {
    ...g0,
    xp: g0.xp + xp,
    daily: { ...g0.daily, [today]: before + xp },
    nodes: marker ? { ...g0.nodes, [marker]: { done: true, best: 100, count: 1, at: new Date().toISOString() } } : g0.nodes,
  };
  if (extra) g = extra(g);
  const activity = plan.activity.includes(today) ? plan.activity : [...plan.activity, today];
  let next: Plan = { ...plan, game: g, activity };
  const newBadges = BADGES.filter((b) => !g.badges.includes(b.id) && b.test(next));
  if (newBadges.length) next = { ...next, game: { ...g, badges: [...g.badges, ...newBadges.map((b) => b.id)] } };
  return {
    plan: next,
    xp,
    newBadges,
    streakExtended: before === 0 && xp > 0 && !plan.activity.includes(today),
    goalReached: before < g.dailyGoal && before + xp >= g.dailyGoal,
  };
}

/** Record a finished lesson node: XP, best accuracy, and the questions missed for later review. */
export function completeLesson(plan: Plan, nodeId: string, xp: number, accuracy: number, missed: string[]): Reward {
  return award(plan, xp, undefined, (g) => {
    const prev = g.nodes[nodeId];
    return {
      ...g,
      nodes: { ...g.nodes, [nodeId]: { done: true, best: Math.max(prev?.best ?? 0, accuracy), count: (prev?.count ?? 0) + 1, at: new Date().toISOString() } },
      mistakes: [...g.mistakes.filter((m) => !missed.includes(m)), ...missed].slice(-20),
    };
  });
}

/* ---------- Badges ---------- */

export interface Badge {
  id: string;
  name: string;
  desc: string;
  test: (p: Plan) => boolean;
}

const doneCount = (p: Plan, kind: string) => Object.entries(game(p).nodes).filter(([k, v]) => v.done && k.endsWith(`:${kind}`)).length;

export const BADGES: Badge[] = [
  { id: "first-steps", name: "First steps", desc: "Finish your first lesson", test: (p) => doneCount(p, "learn") + doneCount(p, "practice") >= 1 },
  { id: "on-fire", name: "On fire", desc: "3-day streak", test: (p) => streak(p.activity) >= 3 },
  { id: "week-warrior", name: "Week warrior", desc: "7-day streak", test: (p) => streak(p.activity) >= 7 },
  { id: "century", name: "Century", desc: "Earn 100 XP", test: (p) => game(p).xp >= 100 },
  { id: "flawless", name: "Flawless", desc: "Finish a lesson with no mistakes", test: (p) => Object.entries(game(p).nodes).some(([k, n]) => /:(learn|practice|checkpoint)$/.test(k) && n.best === 100) },
  { id: "unit-cleared", name: "Unit cleared", desc: "Pass a unit test", test: (p) => doneCount(p, "checkpoint") >= 1 },
  { id: "binge", name: "Binge learner", desc: "Watch 5 mentor picks", test: (p) => Object.values(p.videoPicks ?? {}).filter((v) => v.watched).length >= 5 },
  { id: "doer", name: "Doer", desc: "Complete 10 real-world tasks", test: (p) => Object.keys(game(p).nodes).filter((k) => k.startsWith("task:")).length >= 10 },
  { id: "goal-getter", name: "Goal getter", desc: "Hit your daily goal", test: (p) => todayXp(game(p)) >= game(p).dailyGoal },
];
