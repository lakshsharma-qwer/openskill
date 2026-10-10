# OpenSkill — Learn Anything. Build Everything.

Tell it your goal, current level, available time and deadline. Gemini builds a complete, personalised roadmap and then adapts it as you progress.

## Run it

```bash
npm install
cp .env.local.example .env.local   # then add a Groq key (free: https://console.groq.com/keys) or a Gemini key
npm run dev                         # http://localhost:3000
```

## What's inside

- **Accounts first**: `/signup` → `/welcome` ("I know my goal" or "Help me find my path") → the planning flow. Every app route requires a signed-in user; `/` is the public landing page. Accounts are **device-local** (browser storage, hashed passwords) until a real auth backend is added. `lib/auth.ts` is the only module to swap.
- **App shell**: PW-style sidebar on desktop and bottom tab bar on mobile, with a Home dashboard (`/home`) showing continue-learning, new-goal shortcuts and all your paths. Plans are stored per account.
- **Choose your route first**: after the 4 setup questions, the mentor offers 3 genuinely different routes to the goal (e.g. YouTube self-study vs test-series loop vs crash sprint; content writing vs Shorts vs VA work) with fit %, intensity, typical week, time to result, cost, pros and cons, plus "I have my own approach". The roadmap is built only after you pick, and strictly around that route (`/api/options`, `lib/options.ts`).
- **Learn (Duolingo-style path)** — the default tab. Each roadmap phase is a unit on a winding path; every topic has Lesson → Video → Practice nodes and each unit ends with a unit test. Lessons are AI-generated bite-size cards (concepts, multiple choice, true/false, fill-in-the-blank, put-in-order) with instant feedback, missed questions repeated at the end, combos, sounds, and a celebration screen. XP, daily goal (Casual/Regular/Serious/Intense), streak, levels and badges; real-world tasks (+10) and watched mentor videos (+10) earn XP too. The guide mascot appears in onboarding, lessons and celebrations.
- **Find my path** (`/discover`): for people starting from zero. A short questionnaire (stage, interests, strengths, work style, priorities, money/time constraints) → 5 AI career matches with fit score, why it fits, a normal day, India salary ranges, time to first income, training cost, honest downside, a "try this week" experiment, and careers to avoid. One click turns a match into a goal and pre-fills the roadmap builder.
- **Intake wizard** (`/new`): goal + category, current level & knowledge, hours/day, days/week, deadline, learning style, language, budget.
- **Roadmap**: phases across the whole timeline, with topics in study order, resources (YouTube/Google search links, so no made-up URLs), practice, milestones, revision, mock-test plan, metrics, pitfalls and a reality check.
- **Today**: today's tasks, catch-up items, current phase, daily routine.
- **Weekly plan**: day-by-day tasks with dates and progress, all of them checkable.
- **Mentor-curated videos** (Videos tab, "▶ Mentor's video pick" on tasks and resources): for each lesson the app gathers ~12 YouTube candidates, reads the chapters of long lectures, and the AI picks ONE lesson for this student (level, exam, language, time available, teacher continuity, what's already watched). It gives the exact segment to watch (start/end taken from real chapter data, so it plays from that point), why it beat the others, what to note, and what to practise right after. Picks are saved; "Mark as watched" and "Find a different one" feed back into later picks and the mentor chat.
- **Mentor chat**: a Gemini chat that knows your plan, week and progress.
- **Check-in & adapt**: report how it's going, your struggles and any changes (hours, deadline, goal). Gemini rewrites the remaining roadmap and plans the next weeks.
- Streaks, days left and completion tracking.

Data is stored in the browser (localStorage). API keys stay on the server (`lib/ai.ts`, `app/api/*`).

**YouTube:** without a key the app reads YouTube's public search results. For the official API, add a free `YOUTUBE_API_KEY` (YouTube Data API v3, ~100 searches/day free). Results are cached.

**Models:** curation uses the main model and falls back to `GROQ_FAST_MODEL` (default `openai/gpt-oss-20b`, separate rate limit) when rate-limited.

**Mentor chat:** uses OpenAI (`OPENAI_API_KEY`, default model `gpt-5.2`) first and falls back to Groq automatically if OpenAI errors or takes longer than 45 s. The response header `x-ai-provider` shows which one answered.

**AI provider:** Groq is used when `GROQ_API_KEY` is set (default model `openai/gpt-oss-120b`); otherwise Gemini (`GEMINI_API_KEY`: `AIza…` AI Studio keys or `AQ.…` Vertex AI keys).
On Groq's free tier (8,000 tokens/minute) the app sizes each request to fit, waits and retries when rate-limited, and plans 2 detailed weeks at a time. Each weekly check-in plans the next ones.
