/**
 * Spotify Authorization Code with PKCE — runs entirely in the browser, no
 * client secret needed. The end user authorizes against their own Spotify
 * account on first click, then we use their access token to look up tracks.
 *
 * Setup (developer side, one-time):
 *   1. Register an app at https://developer.spotify.com/dashboard
 *   2. Add your origin to the redirect URIs (e.g. http://localhost:8081/)
 *   3. Set EXPO_PUBLIC_SPOTIFY_CLIENT_ID in your .env
 *
 * If the env var is missing, isSpotifyConfigured() returns false and the
 * Spotify button is hidden — the rest of the app keeps working.
 */
import { Platform } from 'react-native';

const CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;

const TOKEN_KEY = 'lr.spotify.token';
const TOKEN_EXP_KEY = 'lr.spotify.expires_at';
const VERIFIER_KEY = 'lr.spotify.pkce_verifier';
const STATE_KEY = 'lr.spotify.oauth_state';
const PENDING_KEY = 'lr.spotify.pending';

export type PendingSpotifyAction = { artist: string; title: string };

export type OpenOnSpotifyResult =
  | { status: 'opened'; url: string }
  | { status: 'redirecting' }
  | { status: 'unconfigured' }
  | { status: 'not_found' };

function getRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin + '/';
}

export function isSpotifyConfigured(): boolean {
  return Boolean(CLIENT_ID) && Platform.OS === 'web';
}

export function isSpotifyConnected(): boolean {
  return getSpotifyToken() !== null;
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function pkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return base64url(new Uint8Array(digest));
}

export function getSpotifyToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(TOKEN_KEY);
  const exp = Number(localStorage.getItem(TOKEN_EXP_KEY) ?? 0);
  if (!token || Date.now() >= exp) return null;
  return token;
}

async function startSpotifyAuth(pending: PendingSpotifyAction): Promise<void> {
  if (!CLIENT_ID || typeof window === 'undefined') return;
  const verifier = randomString(64);
  const challenge = await pkceChallenge(verifier);
  const state = randomString(16);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

/**
 * On app load, look for an OAuth callback in the URL. If present, exchange
 * the code for an access token and return whatever pending action the user
 * was trying to perform when they got redirected, so the caller can resume.
 */
export async function handleSpotifyCallback(): Promise<PendingSpotifyAction | null> {
  if (typeof window === 'undefined' || !CLIENT_ID) return null;
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (!code && !error) return null;

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const pendingRaw = sessionStorage.getItem(PENDING_KEY);

  // Always strip OAuth params so a refresh doesn't try to redeem them again.
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);

  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(PENDING_KEY);

  if (error || !code || !verifier || state !== expectedState) return null;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; expires_in: number };
  localStorage.setItem(TOKEN_KEY, json.access_token);
  localStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + json.expires_in * 1000));

  return pendingRaw ? (JSON.parse(pendingRaw) as PendingSpotifyAction) : null;
}

export function disconnectSpotify(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXP_KEY);
}

async function searchSpotifyTrack(artist: string, title: string): Promise<string | null> {
  const token = getSpotifyToken();
  if (!token) return null;
  const q = `track:${title} artist:${artist}`;
  const params = new URLSearchParams({ q, type: 'track', limit: '1' });
  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    disconnectSpotify();
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json()) as {
    tracks?: { items?: Array<{ external_urls?: { spotify?: string } }> };
  };
  return data.tracks?.items?.[0]?.external_urls?.spotify ?? null;
}

/**
 * One-shot: open a song on Spotify. If the user isn't connected yet, kick
 * off OAuth (this navigates the page away and the caller won't get a
 * 'not_found' or 'opened' result — only 'redirecting'). Otherwise search
 * for the track and open it in a new tab.
 */
export async function openOnSpotify(
  artist: string,
  title: string,
): Promise<OpenOnSpotifyResult> {
  if (!isSpotifyConfigured()) return { status: 'unconfigured' };
  if (!getSpotifyToken()) {
    await startSpotifyAuth({ artist, title });
    return { status: 'redirecting' };
  }
  const url = await searchSpotifyTrack(artist, title);
  if (!url) {
    // Token might have just been invalidated — try OAuth once more so the
    // user isn't stuck if Spotify expired the session unexpectedly.
    if (!isSpotifyConnected()) {
      await startSpotifyAuth({ artist, title });
      return { status: 'redirecting' };
    }
    return { status: 'not_found' };
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
  return { status: 'opened', url };
}
