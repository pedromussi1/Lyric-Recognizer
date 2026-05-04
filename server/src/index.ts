import 'dotenv/config';
import cors from 'cors';
import express from 'express';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

type CachedToken = { value: string; expiresAt: number };
let cachedToken: CachedToken | null = null;

async function getSpotifyToken(): Promise<string> {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify credentials missing — check server/.env');
  }
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.value;
  }
  const basic = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`,
  ).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`Spotify token request failed: ${res.status}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cachedToken.value;
}

app.get('/api/spotify/search', async (req, res) => {
  const artist = String(req.query.artist ?? '').trim();
  const title = String(req.query.title ?? '').trim();
  if (!artist || !title) {
    res.status(400).json({ error: 'artist and title are required' });
    return;
  }
  try {
    const token = await getSpotifyToken();
    const q = `track:${title} artist:${artist}`;
    const params = new URLSearchParams({ q, type: 'track', limit: '1' });
    const apiRes = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!apiRes.ok) {
      res.status(apiRes.status).json({ error: 'Spotify search failed' });
      return;
    }
    const data = (await apiRes.json()) as {
      tracks?: {
        items?: Array<{
          external_urls?: { spotify?: string };
          preview_url?: string | null;
          album?: { images?: Array<{ url: string }> };
        }>;
      };
    };
    const hit = data.tracks?.items?.[0];
    res.json({
      url: hit?.external_urls?.spotify,
      previewUrl: hit?.preview_url ?? undefined,
      artworkUrl: hit?.album?.images?.[0]?.url,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error';
    res.status(500).json({ error: msg });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Spotify proxy listening on http://localhost:${PORT}`);
});
