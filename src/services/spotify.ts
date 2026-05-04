/**
 * Spotify Authorization Code with PKCE — runs entirely in the browser, no
 * client secret needed. The end user authorizes against their own Spotify
 * account on first click, then we use their access token to look up tracks.
 *
 * Setup (developer side, one-time):
 *   1. Register an app at https://developer.spotify.com/dashboard
 *   2. Add your origin to the redirect URIs (e.g. http://127.0.0.1:8081/)
 *   3. Set EXPO_PUBLIC_SPOTIFY_CLIENT_ID in your .env
 *
 * If the env var is missing, isSpotifyConfigured() returns false and the
 * Spotify button is hidden — the rest of the app keeps working.
 *
 * Auth runs in a new tab so the original tab's transcript and search
 * results aren't blown away. The popup tab does the token exchange,
 * looks up the track, postMessages a status back to the opener, then
 * navigates itself to the Spotify song URL. Pop-up blocked? Falls back
 * to same-tab redirect.
 */
import { Platform } from 'react-native';

const CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID;

const TOKEN_KEY = 'lr.spotify.token';
const TOKEN_EXP_KEY = 'lr.spotify.expires_at';
// PKCE state must be readable by the popup tab, so it lives in localStorage
// rather than sessionStorage. We delete it the moment the exchange runs.
const VERIFIER_KEY = 'lr.spotify.pkce_verifier';
const STATE_KEY = 'lr.spotify.oauth_state';
const PENDING_KEY = 'lr.spotify.pending';

export type PendingSpotifyAction = { artist: string; title: string };

export type OpenOnSpotifyResult =
  | { status: 'opened'; url: string }
  | { status: 'authorizing' }
  | { status: 'unconfigured' }
  | { status: 'not_found' };

export type SpotifyAuthFailReason = 'not_found' | 'auth_failed' | 'no_pending';

export type SpotifyAuthEvent =
  | { kind: 'opened'; artist: string; title: string }
  | { kind: 'failed'; reason: SpotifyAuthFailReason };

const MESSAGE_OPENED = 'lr.spotify.opened';
const MESSAGE_FAILED = 'lr.spotify.failed';

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
  localStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(STATE_KEY, state);
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  const authUrl = `https://accounts.spotify.com/authorize?${params}`;
  const popup = window.open(authUrl, '_blank');
  if (!popup || popup.closed) {
    // Pop-up blocker ate the new tab — fall back to same-tab redirect so
    // the user can still complete auth.
    window.location.assign(authUrl);
  }
}

function postToOpener(message: unknown): void {
  if (typeof window === 'undefined') return;
  const opener = window.opener;
  if (!opener || opener.closed) return;
  try {
    opener.postMessage(message, window.location.origin);
  } catch {
    // ignore
  }
}

/**
 * Runs on app mount in every tab. In a popup tab opened by Spotify auth,
 * exchanges the code for a token, looks up the requested track, notifies
 * the opener via postMessage, and navigates the popup itself to the song
 * URL. In a regular tab with no `?code=`, this is a no-op.
 *
 * The same-tab fallback path (no `window.opener`, e.g. a pop-up blocker
 * forced us to redirect) still returns the pending action so the caller
 * can resume locally.
 */
export async function handleSpotifyCallback(): Promise<PendingSpotifyAction | null> {
  if (typeof window === 'undefined' || !CLIENT_ID) return null;
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (!code && !error) return null;

  // Always strip the OAuth params so a refresh doesn't try to redeem them.
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);

  const verifier = localStorage.getItem(VERIFIER_KEY);
  const expectedState = localStorage.getItem(STATE_KEY);
  const pendingRaw = localStorage.getItem(PENDING_KEY);
  localStorage.removeItem(VERIFIER_KEY);
  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem(PENDING_KEY);

  const isPopup = Boolean(window.opener && !window.opener.closed);

  if (error || !code || !verifier || state !== expectedState) {
    if (isPopup) {
      postToOpener({ type: MESSAGE_FAILED, reason: 'auth_failed' });
      window.close();
    }
    return null;
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });
  let tokenJson: { access_token: string; expires_in: number };
  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      if (isPopup) {
        postToOpener({ type: MESSAGE_FAILED, reason: 'auth_failed' });
        window.close();
      }
      return null;
    }
    tokenJson = await res.json();
  } catch {
    if (isPopup) {
      postToOpener({ type: MESSAGE_FAILED, reason: 'auth_failed' });
      window.close();
    }
    return null;
  }

  localStorage.setItem(TOKEN_KEY, tokenJson.access_token);
  localStorage.setItem(
    TOKEN_EXP_KEY,
    String(Date.now() + tokenJson.expires_in * 1000),
  );

  const pending = pendingRaw
    ? (JSON.parse(pendingRaw) as PendingSpotifyAction)
    : null;

  if (isPopup) {
    if (!pending) {
      postToOpener({ type: MESSAGE_FAILED, reason: 'no_pending' });
      window.close();
      return null;
    }
    const songUrl = await searchSpotifyTrack(pending.artist, pending.title);
    // postMessage must happen before we navigate cross-origin, otherwise
    // window.opener becomes inaccessible.
    if (songUrl) {
      postToOpener({
        type: MESSAGE_OPENED,
        artist: pending.artist,
        title: pending.title,
      });
      window.location.assign(songUrl);
    } else {
      postToOpener({ type: MESSAGE_FAILED, reason: 'not_found' });
      window.close();
    }
    return null;
  }

  // Same-tab fallback: caller resumes the action.
  return pending;
}

/**
 * Listen for status messages from popup auth tabs. Used by the original
 * tab to show "Opened in Spotify" / "Couldn't find that track" feedback
 * after the popup completes its work and closes itself.
 */
export function listenForSpotifyAuth(
  handler: (event: SpotifyAuthEvent) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return;
    const data = e.data as { type?: string } | undefined;
    if (!data?.type) return;
    if (data.type === MESSAGE_OPENED) {
      const d = data as { artist: string; title: string };
      handler({ kind: 'opened', artist: d.artist, title: d.title });
    } else if (data.type === MESSAGE_FAILED) {
      const d = data as { reason: SpotifyAuthFailReason };
      handler({ kind: 'failed', reason: d.reason });
    }
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
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
 * off OAuth in a new tab — the popup handles the rest and the result is
 * surfaced via `listenForSpotifyAuth`. If a token already exists, find
 * and open the track immediately in a new tab.
 */
export async function openOnSpotify(
  artist: string,
  title: string,
): Promise<OpenOnSpotifyResult> {
  if (!isSpotifyConfigured()) return { status: 'unconfigured' };
  if (!getSpotifyToken()) {
    await startSpotifyAuth({ artist, title });
    return { status: 'authorizing' };
  }
  const url = await searchSpotifyTrack(artist, title);
  if (!url) {
    // Token might have just been invalidated — try OAuth once more so the
    // user isn't stuck if Spotify expired the session unexpectedly.
    if (!isSpotifyConnected()) {
      await startSpotifyAuth({ artist, title });
      return { status: 'authorizing' };
    }
    return { status: 'not_found' };
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
  return { status: 'opened', url };
}
