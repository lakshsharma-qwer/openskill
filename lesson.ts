import { languageRule } from "./prompts";
import type { UserProfile } from "./types";

export type LessonKind = "learn" | "practice" | "checkpoint";

export type LessonItem =
  | { type: "concept"; title: string; body: string; example?: string }
  | { type: "mcq"; prompt: string; options: string[]; answer: number; explain: string }
  | { type: "truefalse"; prompt: string; answer: boolean; explain: string }
  | { type: "fill"; prompt: string; options: string[]; answer: number; explain: string }
  | { type: "order"; prompt: string; items: string[]; explain: string };

export interface Lesson {
  title: string;
  items: LessonItem[];
}

export interface LessonRequest {
  profile: UserProfile;
  kind: LessonKind;
  phase: { name: string; objective: string };
  topic?: { name: string; why?: string };
  topics?: string[]; // for checkpoints
  mistakes?: string[];
}

export const LESSON_SYSTEM = `You are a brilliant teacher who writes bite-sized, Duolingo-style lessons.
Each card teaches or tests ONE idea. Explanations are short, concrete and friendly. Questions are unambiguous, have exactly one correct answer, and are answerable by a student at the stated level after the concept cards.
You double-check every answer key — a wrong answer key is the worst possible mistake. Return only JSON.`;

export function lessonPrompt(r: LessonRequest) {
  const p = r.profile;
  const lang = languageRule(p.language);
  const what =
    r.kind === "learn"
      ? `A first lesson on "${r.topic?.name}"${r.topic?.why ? ` (${r.topic.why})` : ""}. Use 3 concept cards, each followed by 1-2 questions on exactly that concept. 8-9 cards total.`
      : r.kind === "practice"
        ? `A practice session on "${r.topic?.name}": 8 questions, no concept cards, slightly harder than an intro, mixing recall, application and common mistakes.`
        : `A unit test covering: ${r.topics?.join(", ")}. 10 questions, no concept cards, spread across all topics, exam-style where relevant.`;
  return `STUDENT: goal "${p.goal}", level ${p.currentLevel}${p.currentKnowledge ? `, knows: ${p.currentKnowledge}` : ""}.
UNIT: ${r.phase.name} — ${r.phase.objective}
LESSON: ${what}
${r.mistakes?.length ? `They recently got these wrong; revisit 1-2 of these ideas in new wording: ${r.mistakes.slice(-6).join(" | ")}` : ""}
${lang}

Mix question types. Card formats:
{"type":"concept","title":"short","body":"max 55 words, **bold** key terms","example":"optional one-line example"}
{"type":"mcq","prompt":"question","options":["4 options"],"answer":0,"explain":"why, 1-2 sentences"}
{"type":"truefalse","prompt":"a statement","answer":true,"explain":"..."}
{"type":"fill","prompt":"sentence with ___ for the missing word","options":["4 single words or short phrases"],"answer":0,"explain":"..."}
{"type":"order","prompt":"Put these in the right order","items":["3-5 steps in the CORRECT order"],"explain":"..."}

Use "order" ONLY for a genuine sequence (steps of a method, a process, a timeline) where exactly one order is correct — never for ranking values that can tie. Skip it if the topic has no natural sequence.
Avoid absolute words ("always", "never") in true/false unless strictly true.
Vary the position of the correct option. Use small, clean numbers in any calculation.
Return JSON: {"title": "short lesson title", "items": [ ...cards ]}
Reminder: ${lang}`;
}

/** Drop anything malformed so the player never shows a broken question. */
export function normalizeLesson(raw: Record<string, unknown>): Lesson {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const items: LessonItem[] = [];
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    const x = it as Record<string, unknown>;
    const options = Array.isArray(x.options) ? x.options.map(s).filter(Boolean) : [];
    const answer = Number(x.answer);
    switch (x.type) {
      case "concept":
        if (s(x.title) && s(x.body)) items.push({ type: "concept", title: s(x.title), body: s(x.body), example: s(x.example) || undefined });
        break;
      case "mcq":
      case "fill":
        if (s(x.prompt) && options.length >= 2 && Number.isInteger(answer) && answer >= 0 && answer < options.length && new Set(options).size === options.length)
          items.push({ type: x.type, prompt: s(x.prompt), options, answer, explain: s(x.explain) });
        break;
      case "truefalse": {
        const a = x.answer === true || x.answer === "true" ? true : x.answer === false || x.answer === "false" ? false : null;
        if (s(x.prompt) && a !== null) items.push({ type: "truefalse", prompt: s(x.prompt), answer: a, explain: s(x.explain) });
        break;
      }
      case "order": {
        const list = Array.isArray(x.items) ? x.items.map(s).filter(Boolean) : [];
        if (s(x.prompt) && list.length >= 3 && list.length <= 6 && new Set(list).size === list.length)
          items.push({ type: "order", prompt: s(x.prompt), items: list, explain: s(x.explain) });
        break;
      }
    }
  }
  return { title: s(raw.title) || "Lesson", items };
}
