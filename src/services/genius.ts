/**
 * Genius search — the only free API that actually searches lyric *content*
 * rather than song titles. Returns song metadata only; we still get the
 * lyrics text from lyrics.ovh (keyed by Genius's title + artist).
 */
const GENIUS_TOKEN = process.env.EXPO_PUBLIC_GENIUS_TOKEN;
const GENIUS_API = 'https://api.genius.com';
const MAX_QUERY_WORDS = 12;

type GeniusSearchHit = {
  type: string;
  result: {
    id: number;
    title: string;
    primary_artist: { name: string };
    song_art_image_url?: string;
    song_art_image_thumbnail_url?: string;
    url: string;
  };
};

export type GeniusCandidate = {
  title: string;
  artist: string;
  artworkUrl?: string;
  geniusUrl: string;
  rank: number;
};

export function isGeniusConfigured(): boolean {
  return Boolean(GENIUS_TOKEN);
}

function buildQuery(transcript: string): string {
  const words = transcript.split(/\s+/).filter(Boolean);
  return words.slice(0, MAX_QUERY_WORDS).join(' ');
}

/**
 * Genius hosts annotated books, poems, and articles alongside songs, and
 * its /search endpoint returns them under the same `type: "song"` shape.
 * The reliable signal that a hit is an actual song is the URL suffix:
 * lyric pages always end with `-lyrics`, other content uses `-annotated`,
 * `-chapter-N`, etc.
 */
function isLyricsUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /-lyrics(?:[/?#]|$)/.test(url);
}

export async function searchGenius(transcript: string): Promise<GeniusCandidate[]> {
  if (!GENIUS_TOKEN) return [];
  const query = buildQuery(transcript);
  if (!query) return [];
  // Pass the token in the URL rather than via Authorization header so the
  // request stays a CORS "simple request" and skips the preflight.
  const params = new URLSearchParams({
    q: query,
    access_token: GENIUS_TOKEN,
  });
  try {
    const res = await fetch(`${GENIUS_API}/search?${params}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { response?: { hits?: GeniusSearchHit[] } };
    const hits = json.response?.hits ?? [];
    return hits
      .filter((h) => h.type === 'song' && isLyricsUrl(h.result.url))
      .map((h, i) => ({
        title: h.result.title,
        artist: h.result.primary_artist.name,
        artworkUrl:
          h.result.song_art_image_url ?? h.result.song_art_image_thumbnail_url,
        geniusUrl: h.result.url,
        rank: i,
      }));
  } catch {
    return [];
  }
}
