import type { Plan, UserProfile } from "./types";
import { currentWeek, weeksBetween } from "./dates";

export const MENTOR_PERSONA = `You are the OpenSkill mentor, a world-class personal mentor, curriculum designer, study planner and career coach.
You do not just give information - you tell the user EXACTLY what to do, in what order, and when.
You are honest, specific, practical and encouraging. You know the Indian context well (JEE, NEET, CAT, GATE, UPSC, CBSE/state boards, college exams, freelancing in India, INR income) as well as global skills and careers.
Rules:
- Be concrete: name specific topics, chapters, skills, deliverables, numbers of questions, hours.
- Recommend real, well-known resources (popular YouTube channels/playlists, books, courses, official sites). Never invent URLs; instead give a precise search query that finds the resource.
- Sequence matters: prerequisites first, high-weightage/high-leverage items early, revision and testing built in.
- Respect the user's available time strictly. Never schedule more hours than they have.
- If the goal is unrealistic for the time given, say so clearly and propose the best achievable version.
- For income goals: no get-rich-quick schemes, no gambling/trading tips, no unethical tactics. Focus on a sellable skill, portfolio, client acquisition and scaling.`;

const ROADMAP_SHAPE = `Return ONLY a JSON object with this exact shape:
{
  "title": string,                     // short motivating name for this roadmap
  "summary": string,                   // 2-3 sentences: the path from where they are to the goal
  "searchContext": string,             // 1-3 words added to every YouTube search to fit this user, e.g. "JEE Hindi", "beginner"
  "realityCheck": string,              // honest feasibility assessment + what success realistically looks like
  "totalWeeks": number,
  "strategy": string[],                // 4-6 core principles of this plan
  "phases": [{
    "id": string,                      // "p1", "p2", ...
    "name": string,
    "startWeek": number, "endWeek": number,
    "objective": string,
    "topics": [{ "name": string, "why": string }],   // in the exact order to study them
    "resources": [{ "title": string, "type": "video"|"playlist"|"book"|"course"|"website"|"tool"|"practice", "creator": string, "searchQuery": string, "free": boolean, "why": string }],
    "practice": string[],              // specific practice: question sets, exercises, projects, outreach targets
    "milestone": string,               // measurable outcome that proves the phase is done
    "revision": string                 // how/when to revise this phase's content
  }],
  "weeks": [{                          // DETAILED plan for the weeks requested
    "week": number,
    "phaseId": string,
    "focus": string,
    "checkpoint": string,              // how to know this week went well
    "tasks": [{ "title": string, "detail": string, "type": "learn"|"practice"|"revise"|"test"|"project"|"outreach"|"review", "estMinutes": number, "day": number, "videoQuery": string }]  // day 1-7; videoQuery: short YouTube search for "learn"/"revise" tasks (e.g. "kinematics one shot class 11"), "" otherwise
  }],
  "dailyRoutine": [{ "block": string, "activity": string, "minutes": number }],
  "revisionStrategy": string,
  "mockTestPlan": [{ "week": number, "what": string }],
  "metrics": [{ "name": string, "target": string }],
  "startToday": string[],              // 3-5 things to do in the next 24 hours
  "pitfalls": string[]
}`;

/** A firm rule for learner-facing text in their preferred language (JSON keys always stay English). */
export function languageRule(language: string) {
  if (!language || language === "English") return "LANGUAGE: write all learner-facing text in simple English.";
  if (language === "Hinglish")
    return "LANGUAGE (mandatory): write all learner-facing text in Hinglish: conversational Hindi written in Latin script, mixed naturally with English, like a friendly Indian teacher. Keep technical terms in English.";
  if (language === "Other") return "LANGUAGE: write all learner-facing text in simple English.";
  const script = language === "Hindi" || language === "Marathi" ? " in Devanagari script" : "";
  return `LANGUAGE (mandatory): write ALL learner-facing text in ${language}${script}, not English. Keep technical terms, numbers and formulas in English. JSON keys stay in English.`;
}

export function profileBlock(p: UserProfile) {
  const weeks = weeksBetween(new Date(), new Date(p.targetDate));
  return `USER PROFILE
- Goal: ${p.goal}
- Category: ${p.category}
- Current level: ${p.currentLevel}
- What they already know / have: ${p.currentKnowledge || "not specified"}
- Time available: ${p.hoursPerDay} hours/day, ${p.daysPerWeek} days/week (= ${(p.hoursPerDay * p.daysPerWeek).toFixed(1)} hours/week)
- Target date: ${p.targetDate} (about ${weeks} weeks from today, ${new Date().toISOString().slice(0, 10)})
- Preferred learning style: ${p.learningStyle.join(", ") || "mixed"}
- Preferred language for resources: ${p.language}
- Budget for resources: ${p.budget}
- Extra context: ${p.extraContext || "none"}${p.chosenPath ? `
- CHOSEN ROUTE (the user picked this; the whole plan must follow it): ${p.chosenPath}` : ""}`;
}

export function roadmapPrompt(p: UserProfile) {
  const weeks = weeksBetween(new Date(), new Date(p.targetDate));
  const detailWeeks = Math.min(2, weeks);
  return `${profileBlock(p)}

Build this user's complete, personalised roadmap from where they are today to their goal.${p.chosenPath ? "\n- Build it around the CHOSEN ROUTE: its method, pace, resources and weekly shape. Do not switch to a different route." : ""}
- Cover the ENTIRE timeline (${weeks} weeks) with phases. Typically 3-7 phases.
- Give a detailed day-by-day task plan for weeks 1 to ${detailWeeks} only (later weeks are generated adaptively as they progress). "weeks" must contain exactly ${detailWeeks} entries (one per week), and each week must have tasks on ${p.daysPerWeek} different days (day 1 to ${Math.min(7, p.daysPerWeek)}), 2-4 tasks per day.
- Only schedule tasks on ${p.daysPerWeek} days per week. On each study day, the tasks' estMinutes must add up to between ${Math.round(p.hoursPerDay * 60 * 0.85)} and ${Math.round(p.hoursPerDay * 60)} minutes — use the time they have, but never more.
- Tasks must be specific and actionable ("Solve 25 questions on Kinematics from HC Verma Ch 3", not "practice physics").
- The daily routine must fit within ${p.hoursPerDay} hours.
- Include mock tests / review checkpoints across the whole timeline where relevant.
- Each phase: at most 6 topics and 2-3 resources matched to the learning style and language.
- Keep every text field short and concrete (one sentence where possible) — the plan must stay compact.

${ROADMAP_SHAPE}`;
}

export function planContext(plan: Plan) {
  const r = plan.roadmap;
  const week = currentWeek(plan.createdAt);
  const total = r.weeks.flatMap((w) => w.tasks);
  const done = total.filter((t) => t.done).length;
  const phases = r.phases
    .map((ph) => `  ${ph.id} "${ph.name}" (weeks ${ph.startWeek}-${ph.endWeek}): ${ph.objective}. Milestone: ${ph.milestone}`)
    .join("\n");
  const weekSummaries = r.weeks
    .map((w) => {
      const d = w.tasks.filter((t) => t.done).length;
      const pending = w.tasks.filter((t) => !t.done).map((t) => t.title);
      return `  Week ${w.week} (${w.focus}): ${d}/${w.tasks.length} done${pending.length ? `. Not done: ${pending.slice(0, 5).join("; ")}` : ""}`;
    })
    .join("\n");
  const checkIns = plan.checkIns
    .slice(-3)
    .map((c) => `  Week ${c.week} (${c.date}): feeling "${c.feeling}", struggles "${c.struggles}", changes "${c.changes}"`)
    .join("\n");
  const watched = Object.values(plan.videoPicks ?? {})
    .filter((v) => v.watched)
    .map((v) => `"${v.video.title}" (${v.video.channel})`);
  return `${profileBlock(plan.profile)}
${watched.length ? `Videos watched so far: ${watched.slice(-10).join("; ")}
` : ""}
CURRENT ROADMAP: "${r.title}" - ${r.totalWeeks} weeks total. The user is now in week ${week}.
Phases:
${phases}
Task progress: ${done}/${total.length} tasks done overall.
${weekSummaries}
${checkIns ? `Recent check-ins:\n${checkIns}` : ""}`;
}

export function adaptPrompt(plan: Plan, checkIn: { feeling: string; struggles: string; changes: string; newHoursPerDay?: number; newTargetDate?: string }) {
  const week = currentWeek(plan.createdAt);
  const from = week;
  return `${planContext(plan)}

CHECK-IN FROM THE USER (week ${week}):
- How it's going: ${checkIn.feeling || "not said"}
- Struggles: ${checkIn.struggles || "none mentioned"}
- Changes to goals/time/situation: ${checkIn.changes || "none"}

${languageRule(plan.profile.language)} (This applies to mentorFeedback; keep the roadmap fields in simple English.)

Adapt the roadmap based on their real progress, performance and any changes. Unfinished important tasks should be carried forward; adjust pace if they are behind or ahead; change the phases if the goal or deadline changed.
Return ONLY a JSON object:
{
  "mentorFeedback": string,   // 3-6 sentences, direct and personal: what's going well, what's not, what changes and why. Written in the learner's language (see LANGUAGE).
  "roadmap": <full updated roadmap>
}
The updated roadmap uses the same shape as below. Keep phases for the whole timeline (update them as needed), but keep every text field concise.
In "weeks", return a detailed day-by-day plan for weeks ${from} to ${from + 1} only (week numbers counted from the start of the plan).
On each study day, tasks must add up to 85-100% of the user's daily time (${Math.round(plan.profile.hoursPerDay * 60)} minutes), never more.

${ROADMAP_SHAPE}`;
}

export function chatSystem(plan: Plan) {
  return `${MENTOR_PERSONA}

You are now chatting with your mentee about their plan. Keep answers focused and practical, use short paragraphs or bullet points, and refer to their actual roadmap, current week and progress. If they ask what to do now, tell them the exact next task(s). If they are demotivated, be warm but firm. Format with plain paragraphs, **bold** and bullet or numbered lists only — never use tables, headings or code blocks.
${languageRule(plan.profile.language)} If the mentee writes to you in a different language, reply in the language they wrote in.

${planContext(plan)}`;
}
