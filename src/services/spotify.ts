/**
 * Talks to the local Express proxy in /server, which holds the Spotify
 * client secret and exchanges Client Credentials for a token. The frontend
 * never sees the secret.
 */
const SPOTIFY_PROXY_URL =
  process.env.EXPO_PUBLIC_SPOTIFY_PROXY_URL ?? 'http://localhost:4000';

export async function findSpotifyUrl(
  artist: string,
  title: string,
): Promise<{ url?: string; artworkUrl?: string; previewUrl?: string }> {
  const params = new URLSearchParams({ artist, title });
  try {
    const res = await fetch(`${SPOTIFY_PROXY_URL}/api/spotify/search?${params}`);
    if (!res.ok) return {};
    const json = (await res.json()) as {
      url?: string;
      artworkUrl?: string;
      previewUrl?: string;
    };
    return json;
  } catch {
    return {};
  }
}
