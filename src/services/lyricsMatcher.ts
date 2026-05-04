import type { LyricsOvhSuggestion, SongMatch } from '../types';
import { longestMatchedPhrase, similarityScore } from '../utils/similarity';
import { isGeniusConfigured, searchGenius } from './genius';

const SUGGEST_URL = 'https://api.lyrics.ovh/suggest';
const LYRICS_URL = 'https://api.lyrics.ovh/v1';

const CANDIDATES_TO_RANK = 6;
const MAX_QUERY_WORDS = 10;

// Variant qualifiers that appear in track titles for non-canonical versions.
// We strip these so live / remastered / deluxe / featured-artist editions
// collapse onto the canonical studio recording when ranking and linking out.
const VARIANT_KEYWORDS =
  'live|remix(?:ed|es)?|acoustic|remaster(?:ed)?|demo|alternate|alternative|' +
  'version|edit|mono|stereo|bonus|deluxe|piano|orchestral|instrumental|' +
  'karaoke|radio|extended|reprise|reissue|cover|take|outtake|session|' +
  'rehearsal|unplugged|single';

const PARENS_VARIANT_RE = new RegExp(
  `\\s*[\\(\\[][^\\)\\]]*\\b(?:${VARIANT_KEYWORDS})\\b[^\\)\\]]*[\\)\\]]\\s*`,
  'gi',
);
const DASH_VARIANT_RE = new RegExp(
  `\\s*-\\s+[^-]*\\b(?:${VARIANT_KEYWORDS})\\b.*$`,
  'i',
);
const FEAT_RE = /\s*[\(\[]?\s*(feat\.?|featuring|ft\.?)\s+[^\)\]]*[\)\]]?/gi;

function cleanTitle(title: string): string {
  return title
    .replace(FEAT_RE, '')
    .replace(PARENS_VARIANT_RE, ' ')
    .replace(DASH_VARIANT_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanArtist(artist: string): string {
  return artist.replace(FEAT_RE, '').replace(/\s+/g, ' ').trim();
}

type Candidate = {
  artist: string;
  title: string;
  artworkUrl?: string;
};

function buildLyricsOvhQuery(transcript: string): string {
  const words = transcript.toLowerCase().split(/\s+/).filter(Boolean);
  const deduped: string[] = [];
  for (const w of words) {
    if (deduped[deduped.length - 1] !== w) deduped.push(w);
  }
  return deduped.slice(0, MAX_QUERY_WORDS).join(' ');
}

async function fetchLyricsOvhCandidates(transcript: string): Promise<Candidate[]> {
  const query = buildLyricsOvhQuery(transcript);
  const res = await fetch(`${SUGGEST_URL}/${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: LyricsOvhSuggestion[] };
  const suggestions = json.data ?? [];
  return suggestions.map((s) => ({
    artist: s.artist.name,
    title: s.title,
    artworkUrl: s.album?.cover_medium ?? s.album?.cover_small,
  }));
}

async function fetchGeniusCandidates(transcript: string): Promise<Candidate[]> {
  const hits = await searchGenius(transcript);
  return hits.map((h) => ({
    artist: h.artist,
    title: h.title,
    artworkUrl: h.artworkUrl,
  }));
}

async function fetchLyrics(artist: string, title: string): Promise<string | null> {
  const res = await fetch(
    `${LYRICS_URL}/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { lyrics?: string; error?: string };
  return json.lyrics ?? null;
}

/**
 * Search lyrics.ovh / Genius for songs matching the transcript and rank them
 * by similarity. Returns up to `limit` matches sorted by confidence desc.
 *
 * Genius is used for search if configured (its endpoint actually searches
 * lyric content). Otherwise we fall back to lyrics.ovh's /suggest, which
 * only matches song titles and artists so it only works when the user sings
 * the title.
 */
export async function findMatches(transcript: string, limit = 5): Promise<SongMatch[]> {
  const cleaned = transcript.trim();
  if (cleaned.length === 0) return [];

  const usingGenius = isGeniusConfigured();
  const candidates = usingGenius
    ? await fetchGeniusCandidates(cleaned)
    : await fetchLyricsOvhCandidates(cleaned);

  if (candidates.length === 0) return [];

  const top = candidates.slice(0, CANDIDATES_TO_RANK);

  const ranked: Array<SongMatch | null> = await Promise.all(
    top.map(async (c, i): Promise<SongMatch | null> => {
      const lyrics = await fetchLyrics(c.artist, c.title);
      let score: number;
      let phrase: string;
      if (lyrics) {
        score = similarityScore(cleaned, lyrics);
        phrase = longestMatchedPhrase(cleaned, lyrics);
      } else if (usingGenius) {
        // Genius found the song from the snippet but lyrics.ovh doesn't
        // have its lyrics text. Trust Genius's own ranking as a confidence
        // proxy — its search is excellent at this.
        score = Math.max(0.2, 0.95 - i * 0.15);
        phrase = '';
      } else {
        return null;
      }
      const positionWeight = 1 - i / (CANDIDATES_TO_RANK * 2);
      return {
        artist: cleanArtist(c.artist),
        title: cleanTitle(c.title),
        confidence: score * positionWeight,
        matchPercent: Math.round(score * 100),
        matchedPhrase: phrase,
        artworkUrl: c.artworkUrl,
      };
    }),
  );

  // Dedupe by canonical (artist, title): when several lyrics.ovh entries
  // collapse to the same song after cleaning (live + remaster + studio of
  // the same track), keep the highest-confidence one.
  const byCanonical = new Map<string, SongMatch>();
  for (const m of ranked) {
    if (m === null || m.matchPercent <= 0) continue;
    const key = `${m.artist.toLowerCase()}|${m.title.toLowerCase()}`;
    const existing = byCanonical.get(key);
    if (!existing || m.confidence > existing.confidence) {
      byCanonical.set(key, m);
    }
  }

  return Array.from(byCanonical.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}
