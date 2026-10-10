export type GoalCategory = "exam" | "skill" | "income" | "academics" | "career" | "other";

export interface UserProfile {
  goal: string;
  category: GoalCategory;
  currentLevel: string; // beginner / intermediate / advanced
  currentKnowledge: string; // free text: what they already know
  hoursPerDay: number;
  daysPerWeek: number;
  targetDate: string; // ISO date
  learningStyle: string[]; // videos, reading, practice, projects...
  language: string; // preferred language for resources
  budget: string; // free only / low / flexible
  extraContext: string;
  chosenPath?: string; // the route the user picked before the plan was built
}

export type TaskType = "learn" | "practice" | "revise" | "test" | "project" | "outreach" | "review";

export interface Task {
  id: string;
  title: string;
  detail?: string;
  type: TaskType;
  estMinutes: number;
  videoQuery?: string; // YouTube search for tasks where a video helps
  day: number; // 1-7 within the week
  done: boolean;
  doneAt?: string;
}

export interface Week {
  week: number;
  phaseId: string;
  focus: string;
  checkpoint: string;
  tasks: Task[];
}

export interface Resource {
  title: string;
  type: string; // video, playlist, book, course, website, tool, practice
  creator?: string;
  searchQuery: string;
  free: boolean;
  why?: string;
}

export interface Phase {
  id: string;
  name: string;
  startWeek: number;
  endWeek: number;
  objective: string;
  topics: { name: string; why: string }[];
  resources: Resource[];
  practice: string[];
  milestone: string;
  revision: string;
}

export interface RoutineBlock {
  block: string;
  activity: string;
  minutes: number;
}

export interface Roadmap {
  title: string;
  summary: string;
  searchContext?: string; // words appended to YouTube searches, e.g. "JEE Hindi"
  realityCheck: string;
  totalWeeks: number;
  strategy: string[];
  phases: Phase[];
  weeks: Week[];
  dailyRoutine: RoutineBlock[];
  revisionStrategy: string;
  mockTestPlan: { week: number; what: string }[];
  metrics: { name: string; target: string }[];
  startToday: string[];
  pitfalls: string[];
}

export interface CheckIn {
  date: string;
  week: number;
  feeling: string;
  struggles: string;
  changes: string;
  completionRate: number;
  mentorFeedback: string;
}

export interface ChatMessage {
  role: "user" | "model";
  text: string;
}

export interface Plan {
  id: string;
  createdAt: string;
  updatedAt: string;
  profile: UserProfile;
  roadmap: Roadmap;
  checkIns: CheckIn[];
  chat: ChatMessage[];
  activity: string[]; // YYYY-MM-DD dates with completed tasks
  videoPicks?: Record<string, VideoPick>; // keyed by "task:<id>", "topic:<phase>:<i>", "course:<phase>"…
  game?: GameState;
}

export interface CuratedVideo {
  id: string;
  kind: "video" | "playlist";
  title: string;
  channel: string;
  thumbnail: string;
  views?: number;
  duration?: string;
  durationSec?: number;
  published?: string;
}

/** A mentor-curated video for one task/topic, saved with the plan so it stays stable. */
export interface VideoPick {
  at: string;
  query: string;
  reviewed: number; // how many candidates the mentor compared
  video: CuratedVideo;
  why: string;
  verdict: "great" | "ok" | "weak";
  start?: number; // seconds
  end?: number;
  segment?: string;
  watchTip?: string;
  focus: string[];
  after?: string;
  alternatives: { video: CuratedVideo; why: string }[];
  watched?: boolean;
  rejected?: string[]; // video ids the user asked to replace
}

/* ---------- Career discovery (for people who don't know their goal yet) ---------- */

export interface DiscoveryAnswers {
  stage: string; // school 8-10, 11-12, college, working…
  education: string; // stream / degree / subjects
  interests: string[];
  flowActivity: string; // "what makes you lose track of time"
  strengths: string[];
  workStyle: Record<string, "left" | "both" | "right">;
  priorities: string[];
  incomeNeed: string; // how soon they need to earn
  budget: string;
  hoursPerDay: number;
  language: string;
  constraints: string; // family expectations, location, health, devices…
}

export interface CareerMatch {
  title: string;
  fit: number; // 0-100
  category: GoalCategory;
  oneLiner: string;
  whyYou: string[];
  dayInLife: string;
  path: string;
  timeToIncome: string;
  salary: { entry: string; experienced: string };
  investment: string;
  outlook: string;
  challenges: string;
  tryThisWeek: string;
  goal: string; // ready-to-use goal for the roadmap builder: the next reachable milestone
  targetMonths: number; // realistic months to reach that milestone
  level: string;
}

export interface Discovery {
  at: string;
  answers: DiscoveryAnswers;
  summary: string;
  careers: CareerMatch[];
  avoid: { title: string; why: string }[];
  nextStep: string;
}

/* ---------- Game layer (Duolingo-style path, XP, streaks) ---------- */

export interface NodeProgress {
  done: boolean;
  best: number; // best accuracy 0-100
  count: number; // times completed
  at: string;
}

export interface GameState {
  xp: number;
  daily: Record<string, number>; // YYYY-MM-DD -> XP earned that day
  dailyGoal: number; // XP per day
  nodes: Record<string, NodeProgress>; // path nodes + one-off XP markers ("task:<id>", "watch:<key>")
  badges: string[];
  mistakes: string[]; // recent questions answered wrong, revisited in practice
}
