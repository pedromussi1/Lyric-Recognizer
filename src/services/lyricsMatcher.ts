import type { LyricsOvhSuggestion, SongMatch } from '../types';
import { longestMatchedPhrase, similarityScore } from '../utils/similarity';

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

/**
 * lyrics.ovh's /suggest endpoint matches best against short, clean phrases.
 * Long transcripts (and especially noisy ones with repeated words from
 * stutters or speech-recognition artifacts) return junk, so we trim to the
 * first N words and collapse consecutive duplicates before searching.
 */
function buildSearchQuery(transcript: string): string {
  const words = transcript.toLowerCase().split(/\s+/).filter(Boolean);
  const deduped: string[] = [];
  for (const w of words) {
    if (deduped[deduped.length - 1] !== w) deduped.push(w);
  }
  return deduped.slice(0, MAX_QUERY_WORDS).join(' ');
}

async function fetchSuggestions(query: string): Promise<LyricsOvhSuggestion[]> {
  const res = await fetch(`${SUGGEST_URL}/${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: LyricsOvhSuggestion[] };
  return json.data ?? [];
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
 * Search lyrics.ovh for songs that match the transcript and rank them
 * by similarity. Returns up to `limit` matches sorted by confidence desc.
 */
export async function findMatches(transcript: string, limit = 5): Promise<SongMatch[]> {
  const cleaned = transcript.trim();
  if (cleaned.length === 0) return [];

  const query = buildSearchQuery(cleaned);
  const suggestions = await fetchSuggestions(query);
  if (suggestions.length === 0) return [];

  const top = suggestions.slice(0, CANDIDATES_TO_RANK);

  const ranked: Array<SongMatch | null> = await Promise.all(
    top.map(async (s, i): Promise<SongMatch | null> => {
      // Use the original title/artist to fetch lyrics — that's what
      // lyrics.ovh has indexed. Only the displayed/linked-out values get
      // cleaned, since live and studio versions share the same lyrics text
      // and we want the canonical name on the card.
      const lyrics = await fetchLyrics(s.artist.name, s.title);
      if (!lyrics) return null;
      const score = similarityScore(cleaned, lyrics);
      const phrase = longestMatchedPhrase(cleaned, lyrics);
      const positionWeight = 1 - i / (CANDIDATES_TO_RANK * 2);
      return {
        artist: cleanArtist(s.artist.name),
        title: cleanTitle(s.title),
        confidence: score * positionWeight,
        matchPercent: Math.round(score * 100),
        matchedPhrase: phrase,
        artworkUrl: s.album?.cover_medium ?? s.album?.cover_small,
        previewUrl: s.preview,
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
