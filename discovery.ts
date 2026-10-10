import type { CareerMatch, Discovery, DiscoveryAnswers, GoalCategory } from "./types";

/** Either-or questions about how someone likes to work. Shared by the form and the prompt. */
export const WORK_STYLE: { id: string; left: string; right: string }[] = [
  { id: "people", left: "Working with people", right: "Working with things, data or code" },
  { id: "mode", left: "Creative work", right: "Analytical work" },
  { id: "security", left: "Stable salaried job", right: "Own business / freelance" },
  { id: "place", left: "Desk / computer", right: "On the move / field work" },
  { id: "routine", left: "Fixed routine", right: "Something new every day" },
  { id: "team", left: "Working alone", right: "Working in a team" },
];

export const DISCOVERY_SYSTEM = `You are an experienced career counsellor and mentor in India who has guided thousands of students and professionals.
You match people to careers based on evidence from their answers — interests, strengths, work style, priorities and real constraints (money, time, family, location).
You are honest: you mention downsides, realistic salaries and how long it takes to earn. You never push prestige careers that don't fit, and you include modern skill-based paths (tech, design, content, trades, freelancing, government jobs) alongside exam/degree paths when they suit the person.`;

export function discoveryPrompt(a: DiscoveryAnswers) {
  const style = WORK_STYLE.map((q) => {
    const v = a.workStyle[q.id];
    return `  - ${v === "left" ? q.left : v === "right" ? q.right : `Both "${q.left}" and "${q.right}"`}`;
  }).join("\n");
  return `PERSON
- Stage of life: ${a.stage}
- Education / stream: ${a.education || "not specified"}
- Interests: ${a.interests.join(", ") || "not specified"}
- Loses track of time when: ${a.flowActivity || "not specified"}
- Strengths: ${a.strengths.join(", ") || "not specified"}
- Work style preferences:
${style}
- What matters most: ${a.priorities.join(", ") || "not specified"}
- Needs to start earning: ${a.incomeNeed}
- Budget for training/education: ${a.budget}
- Time available to learn: ${a.hoursPerDay} hours/day
- Preferred language: ${a.language}
- Constraints / context: ${a.constraints || "none mentioned"}

Recommend the 5 best-fit careers for THIS person, best first. Make them genuinely different from each other (not 5 variations of one job).
Respect constraints: if they need income soon, favour paths that can earn within that time; if the budget is low, favour free/low-cost routes; if they're in school, the path may be an entrance exam or degree.
Salaries: realistic India ranges in ₹ (LPA or per month), conservative, typical not best-case.

Return ONLY JSON:
{
  "summary": "2-3 sentences: what their answers say about them",
  "careers": [{
    "title": string,
    "fit": number,                       // 0-100, honest
    "category": "exam"|"academics"|"skill"|"income"|"career",   // how they'd get there: entrance exam, degree/studies, learn a skill, freelance income, job switch
    "oneLiner": "what the job is, in plain words",
    "whyYou": ["3 reasons tied to their specific answers"],
    "dayInLife": "2 sentences on what a normal workday looks like",
    "path": "how to get in: exam/degree/skill route, in 1-2 sentences",
    "timeToIncome": "e.g. 6-9 months",
    "salary": { "entry": string, "experienced": string },
    "investment": "rough cost of training, e.g. Free (online) or ₹2-4 lakh degree",
    "outlook": "demand / future in 1 sentence",
    "challenges": "the honest downside, 1 sentence",
    "tryThisWeek": "a 2-3 hour experiment to test if they'd enjoy it, before committing",
    "goal": "the NEXT concrete, measurable milestone on this path that this person can reach within targetMonths (e.g. 'Get my first job as a UI/UX designer within 9 months'). For school students this is the next educational step (e.g. 'Choose PCM after Class 10 and build strong maths and physics foundations'), never a job years away",
    "targetMonths": number,           // realistic months to reach that milestone, 1-24
    "level": "Complete beginner"|"Beginner"|"Intermediate"|"Advanced"
  }],
  "avoid": [{ "title": string, "why": "why it's a poor fit for them despite seeming attractive" }],   // 0-2 items
  "nextStep": "1-2 sentences: how to decide between the top matches"
}`;
}

const CATEGORIES: GoalCategory[] = ["exam", "academics", "skill", "income", "career", "other"];

export function normalizeDiscovery(raw: Record<string, unknown>, answers: DiscoveryAnswers): Discovery {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const careers: CareerMatch[] = arr(raw.careers)
    .map((c: Record<string, unknown>) => {
      const salary = (c.salary ?? {}) as Record<string, unknown>;
      return {
        title: s(c.title),
        fit: Math.max(0, Math.min(100, Math.round(Number(c.fit) || 0))),
        category: CATEGORIES.includes(c.category as GoalCategory) ? (c.category as GoalCategory) : "career",
        oneLiner: s(c.oneLiner),
        whyYou: arr(c.whyYou).map(s).filter(Boolean),
        dayInLife: s(c.dayInLife),
        path: s(c.path),
        timeToIncome: s(c.timeToIncome),
        salary: { entry: s(salary.entry), experienced: s(salary.experienced) },
        investment: s(c.investment),
        outlook: s(c.outlook),
        challenges: s(c.challenges),
        tryThisWeek: s(c.tryThisWeek),
        goal: s(c.goal) || `Become a ${s(c.title)}`,
        targetMonths: Math.min(24, Math.max(1, Math.round(Number(c.targetMonths) || 6))),
        level: s(c.level) || "Complete beginner",
      };
    })
    .filter((c) => c.title)
    .sort((a, b) => b.fit - a.fit);
  return {
    at: new Date().toISOString(),
    answers,
    summary: s(raw.summary),
    careers,
    avoid: arr(raw.avoid)
      .map((x: Record<string, unknown>) => ({ title: s(x.title), why: s(x.why) }))
      .filter((x) => x.title),
    nextStep: s(raw.nextStep),
  };
}
