import "server-only";
import { generateJSON } from "./ai";
import type { CuratedVideo, UserProfile, VideoPick } from "./types";
import { type Chapter, type VideoResult, findVideos, getChapters } from "./youtube";

export interface CurateRequest {
  profile: UserProfile;
  lesson: { title: string; detail?: string; phase?: string };
  query: string;
  kind: "video" | "playlist";
  minutes?: number; // time the student has for this lesson
  teachers: string[]; // channels the student already learns from
  watched: string[]; // titles already watched
  exclude: string[]; // video ids to never pick
}

const SYSTEM = `You are an expert mentor who curates YouTube lessons for one specific student.
You review candidate videos like a great teacher would: right level, right exam/syllabus, right language, clear teaching, trusted educator, not clickbait, and a fit for the time the student has.
You are decisive: pick ONE best lesson, and say exactly which part to watch and what to do with it. Return only JSON.`;

export async function curate(req: CurateRequest): Promise<Omit<VideoPick, "at">> {
  // 1. Gather candidates from two angles of the same search.
  const variant = req.kind === "playlist" ? `${req.query} full course` : `${req.query} explained`;
  const [a, b] = await Promise.all([findVideos(req.query, req.kind, 10), findVideos(variant, req.kind, 8).catch(() => [])]);
  const seen = new Set(req.exclude);
  const candidates = [...a, ...b].filter((v) => !seen.has(v.id) && (seen.add(v.id), true)).slice(0, 12);
  if (!candidates.length) throw new Error("No suitable videos found for this lesson.");

  // 2. Read chapters of the top long videos so the mentor can pick an exact segment.
  const needSegment = (v: VideoResult) => req.kind === "video" && v.durationSec && req.minutes && v.durationSec > req.minutes * 60 * 1.25;
  const chapters = new Map<string, Chapter[]>();
  await Promise.all(
    candidates
      .filter(needSegment)
      .slice(0, 5)
      .map(async (v) => chapters.set(v.id, await getChapters(v.id))),
  );

  // 3. Let the mentor decide.
  const list = candidates
    .map((v, i) => {
      const meta = [v.channel, v.views !== undefined ? `${compact(v.views)} views` : "", v.duration, v.published].filter(Boolean).join(" · ");
      const list = chapters.get(v.id) ?? [];
      const ch = list
        .slice(0, 40)
        .map((c, k) => `c${k + 1} ${hms(c.start)} (${Math.round(((list[k + 1]?.start ?? v.durationSec ?? c.start) - c.start) / 60)}m) ${c.title.slice(0, 40)}`)
        .join(" | ");
      return `[${i + 1}] "${v.title}" — ${meta}${v.snippet ? `\n    about: ${v.snippet.slice(0, 140)}` : ""}${ch ? `\n    chapters: ${ch}` : ""}`;
    })
    .join("\n");

  const p = req.profile;
  const prompt = `STUDENT
- Goal: ${p.goal} (${p.category})
- Level: ${p.currentLevel}. Knows: ${p.currentKnowledge || "not specified"}
- Language: ${p.language}. Learns best with: ${p.learningStyle.join(", ") || "mixed"}
${req.teachers.length ? `- Already learning from: ${req.teachers.join(", ")} (prefer the same teacher if comparable, for continuity)` : ""}
${req.watched.length ? `- Already watched: ${req.watched.slice(-8).join("; ")}` : ""}

LESSON NEEDED: ${req.lesson.title}${req.lesson.detail ? ` — ${req.lesson.detail}` : ""}${req.lesson.phase ? ` (phase: ${req.lesson.phase})` : ""}
${req.kind === "playlist" ? "Looking for: one complete course/playlist to follow for this phase." : `Time available: ${req.minutes ?? 60} minutes.`}

CANDIDATES
${list}

Decide:
- The single best ${req.kind} for THIS student and THIS lesson. Weigh: syllabus/exam match, level (beginners need concept-building, not PYQ marathons), language, teaching quality signals (views relative to age, known educators), recency, and time fit.
- ${req.kind === "video" ? `Prefer a video whose length fits the time. A longer video is fine only if its chapters (c1, c2… with h:mm:ss start time and (length)) contain exactly this lesson — then list the consecutive chapter ids to watch, aiming for about ${req.minutes ?? 60} minutes in total. Read chapter TITLES carefully; only choose chapters that are about this lesson. If the video fits as a whole or has no chapters, use [].` : "Use [] for chapters."}
- Reject wrong class/exam, wrong language, clickbait and shallow videos.

Return JSON:
{"pick": number, "verdict": "great"|"ok"|"weak", "why": "2 specific sentences: why this beats the others for this student",
 "chapters": ["c4", "c5"], "segment": "what that part teaches, in words (no times or chapter ids)"|null,
 "watchTip": "how to watch it (e.g. pause at each example and solve first, 1.25x for revision)",
 "focus": ["3 short things to note while watching"],
 "after": "one concrete practice action right after watching",
 "alternatives": [{"pick": number, "why": "when this one is the better choice"}]}  // max 2`;

  // The main model judges noticeably better; if it's rate-limited, fall back to the fast model
  // (separate budget on Groq) instead of making the student wait.
  const ask = { system: SYSTEM, contents: [{ role: "user" as const, text: prompt }], temperature: 0.3 };
  const out = await generateJSON<Record<string, unknown>>({ ...ask, retries: 0 }).catch((e: { status?: number }) => {
    if (e.status === 429) return generateJSON<Record<string, unknown>>({ ...ask, fast: true });
    throw e;
  });

  const at = (n: unknown) => candidates[Math.round(Number(n)) - 1];
  const chosen = at(out.pick) ?? candidates[0];
  // Turn chosen chapter ids into real start/end times — never trust model-written timestamps.
  const chosenChapters = chapters.get(chosen.id) ?? [];
  const ids = (Array.isArray(out.chapters) ? out.chapters : [])
    .map((c) => parseInt(String(c).replace(/\D/g, ""), 10) - 1)
    .filter((i) => i >= 0 && i < chosenChapters.length)
    .sort((x, y) => x - y);
  // Span from the first to the last chosen chapter (a lecture's sections run in order),
  // but never past ~1.5x the session's time; the first chapter is always kept.
  const chapterEnd = (i: number) => chosenChapters[i + 1]?.start ?? chosen.durationSec ?? chosenChapters[i].start;
  const budget = (req.minutes ?? 60) * 60 * 1.5;
  const first = ids[0];
  const last = ids.filter((i) => first !== undefined && chapterEnd(i) - chosenChapters[first].start <= budget).pop() ?? first;
  const start = first !== undefined ? chosenChapters[first].start : undefined;
  const end = last !== undefined ? chapterEnd(last) : undefined;

  const seenAlt = new Set([chosen.id]);
  const alternatives = (Array.isArray(out.alternatives) ? out.alternatives : [])
    .map((x: { pick?: unknown; why?: unknown }) => ({ v: at(x.pick), why: String(x.why ?? "") }))
    .filter((x) => x.v && !seenAlt.has(x.v.id) && (seenAlt.add(x.v.id), true))
    .slice(0, 2)
    .map((x) => ({ video: toCurated(x.v), why: stripIds(x.why) }));

  return {
    query: req.query,
    reviewed: candidates.length,
    video: toCurated(chosen),
    verdict: out.verdict === "great" || out.verdict === "weak" ? out.verdict : "ok",
    why: stripIds(String(out.why ?? "")),
    start,
    end,
    // The model's own timestamps in this text are unreliable; the UI shows the real start/end.
    segment: start !== undefined && out.segment ? cleanSegment(String(out.segment)) : undefined,
    watchTip: out.watchTip ? stripIds(String(out.watchTip)) : undefined,
    focus: (Array.isArray(out.focus) ? out.focus : []).map((f) => stripIds(String(f))).filter(Boolean).slice(0, 4),
    after: out.after ? stripIds(String(out.after)) : undefined,
    alternatives,
  };
}

function toCurated(v: VideoResult): CuratedVideo {
  return { id: v.id, kind: v.kind, title: v.title, channel: v.channel, thumbnail: v.thumbnail, views: v.views, duration: v.duration, durationSec: v.durationSec, published: v.published };
}

/** Remove the internal chapter ids (c4, "chapter c9") the model sometimes repeats back. */
function stripIds(text: string) {
  return text
    .replace(/\s*\((?:chapters?\s+)?c\d+(?:\s*[-–,&]\s*c?\d+)*\)/gi, "")
    .replace(/\b(?:of|in|from)\s+chapters?\s+c\d+\b/gi, "in this part")
    .replace(/\bchapters?\s+c\d+\b/gi, "this part")
    .replace(/\bc\d+\b/g, "this part")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanSegment(text: string) {
  return text
    .replace(/\(?\b\d{1,2}(:\d{2}){1,2}\s*[-–‑]\s*\d{1,2}(:\d{2}){1,2}\)?/g, "")
    .replace(/\b[Cc]hapters?\s+/g, "")
    .replace(/\bc\d+\b[:,]?\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

/** Always h:mm:ss so chapter times in a list are unambiguous. */
function hms(sec: number) {
  return `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function compact(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}
