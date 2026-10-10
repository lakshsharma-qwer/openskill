import "server-only";

/*
 * Finds YouTube videos/playlists for a query.
 *  - With YOUTUBE_API_KEY: the official YouTube Data API v3 (search + video stats).
 *  - Without: parses YouTube's public search results page.
 * Results are ranked by relevance and popularity, Shorts are dropped, and everything is cached.
 */

export type VideoKind = "video" | "playlist";

export interface VideoResult {
  id: string;
  kind: VideoKind;
  title: string;
  channel: string;
  thumbnail: string;
  views?: number;
  durationSec?: number;
  duration?: string; // "12:34" or "25 videos"
  published?: string;
  snippet?: string; // description excerpt
}

export interface Chapter {
  start: number; // seconds
  title: string;
}

const cache = new Map<string, { at: number; items: VideoResult[] }>();
const TTL = 6 * 60 * 60 * 1000;

export async function findVideos(query: string, kind: VideoKind, limit = 6): Promise<VideoResult[]> {
  const key = `${kind}:${query.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.items.slice(0, limit);

  const raw = process.env.YOUTUBE_API_KEY ? await viaApi(query, kind, process.env.YOUTUBE_API_KEY) : await viaSearchPage(query, kind);
  const items = rank(raw, kind);
  if (items.length) cache.set(key, { at: Date.now(), items });
  return items.slice(0, limit);
}

/** Keep YouTube's relevance order as the base, then reward popularity; drop Shorts and tiny clips. */
function rank(items: VideoResult[], kind: VideoKind) {
  const seen = new Set<string>();
  return items
    .filter((v) => (seen.has(v.id) ? false : (seen.add(v.id), true)))
    .filter((v) => kind === "playlist" || v.durationSec === undefined || v.durationSec >= 120)
    .map((v, position) => ({ v, score: Math.log10((v.views ?? 1000) + 10) - position * 0.25 }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.v);
}

/* ---------- Official API ---------- */

async function viaApi(query: string, kind: VideoKind, key: string): Promise<VideoResult[]> {
  const params = new URLSearchParams({ part: "snippet", q: query, type: kind, maxResults: "15", relevanceLanguage: "en", regionCode: "IN", safeSearch: "strict", key });
  if (kind === "video") params.set("videoEmbeddable", "true");
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `YouTube API error ${res.status}`);

  type Item = { id: { videoId?: string; playlistId?: string }; snippet: { title: string; channelTitle: string; publishedAt: string; thumbnails: Record<string, { url: string }> } };
  const items: VideoResult[] = (data.items as Item[]).map((it) => ({
    id: (kind === "video" ? it.id.videoId : it.id.playlistId) ?? "",
    kind,
    title: decodeEntities(it.snippet.title),
    channel: it.snippet.channelTitle,
    thumbnail: (it.snippet.thumbnails.high ?? it.snippet.thumbnails.medium ?? it.snippet.thumbnails.default).url,
    published: it.snippet.publishedAt.slice(0, 10),
  }));
  if (kind !== "video" || !items.length) return items.filter((i) => i.id);

  // Fetch view counts and durations for ranking.
  const stats = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({ part: "statistics,contentDetails", id: items.map((i) => i.id).join(","), key })}`,
  ).then((r) => r.json());
  const byId = new Map<string, { statistics?: { viewCount?: string }; contentDetails?: { duration?: string } }>(
    (stats.items ?? []).map((s: { id: string }) => [s.id, s]),
  );
  return items.map((i) => {
    const s = byId.get(i.id);
    const sec = isoDuration(s?.contentDetails?.duration);
    return { ...i, views: s?.statistics?.viewCount ? +s.statistics.viewCount : undefined, durationSec: sec, duration: sec ? clock(sec) : undefined };
  });
}

/* ---------- Public search page ---------- */

async function viaSearchPage(query: string, kind: VideoKind): Promise<VideoResult[]> {
  const params = new URLSearchParams({ search_query: query, hl: "en", gl: "IN" });
  params.set("sp", kind === "playlist" ? "EgIQAw==" : "EgIQAQ=="); // filter: playlists / videos
  const res = await fetch(`https://www.youtube.com/results?${params}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`YouTube search failed (${res.status})`);
  const html = await res.text();
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return [];

  const out: VideoResult[] = [];
  walk(JSON.parse(m[1]), (node) => {
    if (node.videoRenderer) {
      const v = node.videoRenderer;
      const sec = clockToSeconds(v.lengthText?.simpleText);
      out.push({
        id: v.videoId,
        kind: "video",
        title: runsText(v.title),
        channel: runsText(v.ownerText),
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        views: parseCount(v.viewCountText?.simpleText),
        durationSec: sec,
        duration: v.lengthText?.simpleText,
        published: v.publishedTimeText?.simpleText,
        snippet: v.detailedMetadataSnippets?.[0]?.snippetText ? runsText(v.detailedMetadataSnippets[0].snippetText) : undefined,
      });
      return true;
    }
    if (node.lockupViewModel) {
      const l = node.lockupViewModel;
      if (!String(l.contentType ?? "").includes("PLAYLIST") || !l.contentId) return true;
      const meta = l.metadata?.lockupMetadataViewModel;
      const parts = meta?.metadata?.contentMetadataViewModel?.metadataRows?.flatMap((r: { metadataParts?: unknown[] }) => r.metadataParts ?? []) ?? [];
      const badges: string[] = [];
      walk(l.contentImage, (n) => {
        if (n.thumbnailBadgeViewModel?.text) badges.push(n.thumbnailBadgeViewModel.text);
        return false;
      });
      const thumbs: string[] = [];
      walk(l.contentImage, (n) => {
        if (Array.isArray(n.sources) && n.sources[0]?.url) thumbs.push(n.sources[n.sources.length - 1].url);
        return false;
      });
      out.push({
        id: l.contentId,
        kind: "playlist",
        title: meta?.title?.content ?? "Playlist",
        channel: parts[0]?.text?.content ?? "",
        thumbnail: thumbs[0] ?? "",
        duration: badges[0],
      });
      return true;
    }
    return false;
  });
  return out.filter((v) => v.kind === kind && v.id && v.title);
}

/* ---------- Chapters ---------- */

const chapterCache = new Map<string, Chapter[]>();

/** A video's chapters, from YouTube's chapter markers or timestamps in the description. */
export async function getChapters(videoId: string): Promise<Chapter[]> {
  const hit = chapterCache.get(videoId);
  if (hit) return hit;
  let chapters: Chapter[] = [];
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await res.text();
    const data = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
    if (data) {
      walk(JSON.parse(data[1]), (n) => {
        if (n.chapterRenderer) {
          chapters.push({ start: Math.round(n.chapterRenderer.timeRangeStartMillis / 1000), title: runsText(n.chapterRenderer.title) });
          return true;
        }
        return false;
      });
    }
    if (!chapters.length) {
      const player = html.match(/var ytInitialPlayerResponse = (\{.*?\});(?:var|<\/script>)/s);
      const desc: string = player ? JSON.parse(player[1])?.videoDetails?.shortDescription ?? "" : "";
      for (const m of desc.matchAll(/^\s*\(?(\d{1,2}:\d{2}(?::\d{2})?)\)?\s*[-–—:]?\s*(.+)$/gm)) {
        chapters.push({ start: clockToSeconds(m[1]) ?? 0, title: m[2].trim() });
      }
    }
  } catch {
    // Chapters are a bonus; curation works without them.
  }
  const seen = new Set<number>();
  chapters = chapters.filter((c) => c.title && !seen.has(c.start) && (seen.add(c.start), true)).sort((a, b) => a.start - b.start);
  chapterCache.set(videoId, chapters);
  return chapters;
}

/* ---------- helpers ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walk(node: any, visit: (n: any) => boolean) {
  if (!node || typeof node !== "object") return;
  if (!Array.isArray(node) && visit(node)) return;
  for (const v of Object.values(node)) walk(v, visit);
}

function runsText(t?: { runs?: { text: string }[]; simpleText?: string }) {
  return t?.simpleText ?? t?.runs?.map((r) => r.text).join("") ?? "";
}

function parseCount(s?: string) {
  if (!s) return undefined;
  const m = s.replace(/,/g, "").match(/([\d.]+)\s*([KMB])?/i);
  if (!m) return undefined;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? "").toUpperCase() as "K" | "M" | "B"] ?? 1;
  return Math.round(parseFloat(m[1]) * mult);
}

function clockToSeconds(s?: string) {
  if (!s) return undefined;
  return s.split(":").reduce((acc, p) => acc * 60 + (parseInt(p, 10) || 0), 0);
}

function isoDuration(s?: string) {
  const m = s?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + +(m[3] ?? 0) : undefined;
}

export function clock(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
