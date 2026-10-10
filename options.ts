import { profileBlock } from "./prompts";
import type { UserProfile } from "./types";

/** One way of reaching the goal, offered before any plan is built. */
export interface PathOption {
  id: string;
  title: string;
  approach: string;
  fit: number; // 0-100 for this person
  recommended: boolean;
  whyFit: string[];
  howItWorks: string;
  weeklyShape: string;
  intensity: "Light" | "Steady" | "Intense";
  timeToResult: string;
  cost: string;
  pros: string[];
  cons: string[];
  bestIf: string;
}

export const OPTIONS_SYSTEM = `You are an experienced mentor. Before building anyone's plan, you lay out the genuinely different routes to their goal so they can choose.
Routes must be meaningfully different strategies (a different skill, platform, method or pace), not three versions of the same plan. Be honest about trade-offs. Return only JSON.`;

export function optionsPrompt(p: UserProfile) {
  return `${profileBlock(p)}

Offer exactly 3 distinct routes to this goal that fit their time, level, budget and learning style.
Examples of what "distinct" means:
- Exam prep: free YouTube self-study track vs test-series-led practice track vs crash revision sprint.
- Online income: different sellable skills or channels (e.g. video editing freelance vs social media management vs a remote job).
- Learning a skill: project-first vs course-first vs mentor/community-led.
Mark exactly one as recommended (the best fit for THIS person). Use realistic, conservative numbers in ₹ where relevant.

Return JSON:
{
  "summary": "1-2 sentences: what matters most for this person's choice",
  "options": [{
    "title": "short name of the route",
    "approach": "one plain sentence: what you'll actually do",
    "fit": number,                     // 0-100 (percentage), e.g. 86
    "recommended": boolean,
    "whyFit": ["2-3 reasons tied to their answers"],
    "howItWorks": "2 sentences",
    "weeklyShape": "what a typical week looks like, e.g. 'Mon–Sat: 1h lectures + 1h practice; Sun: mock test'",
    "intensity": "Light"|"Steady"|"Intense",
    "timeToResult": "e.g. 'First client in ~6 weeks' or 'Syllabus done in 5 months'",
    "cost": "e.g. 'Free' or '₹1,500 for a test series'",
    "pros": ["2 short points"],
    "cons": ["2 short points"],
    "bestIf": "one line: choose this if…"
  }]
}`;
}

export function normalizeOptions(raw: Record<string, unknown>): { summary: string; options: PathOption[] } {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);
  const options: PathOption[] = (Array.isArray(raw.options) ? raw.options : [])
    .map((o: Record<string, unknown>, i: number) => ({
      id: `opt${i + 1}`,
      title: s(o.title),
      approach: s(o.approach),
      fit: Math.max(0, Math.min(100, Math.round(Number(o.fit) || 0))),
      recommended: o.recommended === true,
      whyFit: list(o.whyFit),
      howItWorks: s(o.howItWorks),
      weeklyShape: s(o.weeklyShape),
      intensity: (["Light", "Steady", "Intense"].includes(o.intensity as string) ? o.intensity : "Steady") as PathOption["intensity"],
      timeToResult: s(o.timeToResult),
      cost: s(o.cost),
      pros: list(o.pros),
      cons: list(o.cons),
      bestIf: s(o.bestIf),
    }))
    .filter((o) => o.title)
    .slice(0, 3);
  // Some models answer fit on a 0-10 scale; convert so the UI always shows a percentage.
  if (options.length && options.every((o) => o.fit <= 10)) options.forEach((o) => (o.fit = Math.min(100, o.fit * 10)));
  // Exactly one recommendation: keep the model's first pick, else the best fit.
  const rec = options.findIndex((o) => o.recommended);
  const best = rec >= 0 ? rec : options.reduce((b, o, i) => (o.fit > options[b].fit ? i : b), 0);
  options.forEach((o, i) => (o.recommended = i === best));
  return { summary: s(raw.summary), options };
}
