/**
 * iTunes Search API is public (no auth) and returns Apple Music links.
 * https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/
 */
const ITUNES_SEARCH = 'https://itunes.apple.com/search';

type ITunesResult = {
  trackViewUrl?: string;
  artworkUrl100?: string;
  previewUrl?: string;
};

export async function findAppleMusicUrl(
  artist: string,
  title: string,
): Promise<{ url?: string; artworkUrl?: string; previewUrl?: string }> {
  const term = `${artist} ${title}`;
  const params = new URLSearchParams({
    term,
    media: 'music',
    entity: 'song',
    limit: '1',
  });
  try {
    const res = await fetch(`${ITUNES_SEARCH}?${params}`);
    if (!res.ok) return {};
    const json = (await res.json()) as { results?: ITunesResult[] };
    const hit = json.results?.[0];
    if (!hit) return {};
    return {
      url: hit.trackViewUrl,
      artworkUrl: hit.artworkUrl100?.replace('100x100', '400x400'),
      previewUrl: hit.previewUrl,
    };
  } catch {
    return {};
  }
}
