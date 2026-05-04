import type { LyricsOvhSuggestion, SongMatch } from '../types';
import { longestMatchedPhrase, similarityScore } from '../utils/similarity';

const SUGGEST_URL = 'https://api.lyrics.ovh/suggest';
const LYRICS_URL = 'https://api.lyrics.ovh/v1';

const CANDIDATES_TO_RANK = 6;
const MAX_QUERY_WORDS = 10;

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
      const lyrics = await fetchLyrics(s.artist.name, s.title);
      if (!lyrics) return null;
      const score = similarityScore(cleaned, lyrics);
      const phrase = longestMatchedPhrase(cleaned, lyrics);
      const positionWeight = 1 - i / (CANDIDATES_TO_RANK * 2);
      return {
        artist: s.artist.name,
        title: s.title,
        confidence: score * positionWeight,
        matchPercent: Math.round(score * 100),
        matchedPhrase: phrase,
        artworkUrl: s.album?.cover_medium ?? s.album?.cover_small,
        previewUrl: s.preview,
      };
    }),
  );

  return ranked
    .filter((m): m is SongMatch => m !== null && m.matchPercent > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}
