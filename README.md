# Lyric Recognizer

Sing or speak the lyrics to a song and get a ranked list of likely matches with one-tap links to Spotify and Apple Music. Built with Expo + React Native, so the same codebase runs on web today and is set up to ship to iOS later.

## How it works

1. **Capture** — the browser's Web Speech API transcribes your voice in real time.
2. **Search** — the transcript is sent to the [lyrics.ovh](https://lyricsovh.docs.apiary.io/) suggest endpoint, which returns candidate songs.
3. **Rank** — for the top candidates we fetch the full lyrics and score each against your transcript using a token + bigram similarity. Results are ordered by confidence (rank-weighted) and a 0–100% match score.
4. **Listen** — every match gets an Apple Music link via the public iTunes Search API. The Spotify button uses [Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow): on first click, you sign into your own Spotify account; afterward the app uses your token to find and open the track.

```
voice ─▶ Web Speech API ─▶ transcript
                              │
                              ▼
                      lyrics.ovh /suggest ─▶ top N candidates
                                                │
                                                ▼
                              fetch lyrics + similarity score
                                                │
                                                ▼
                          ┌──────── ranked matches ────────┐
                          │                                │
                          ▼                                ▼
                Spotify Web API                  iTunes Search API
              (PKCE, user-signed-in)            (public, no auth)
```

There is **no backend**: lyrics.ovh, iTunes Search, and Spotify (with PKCE) are all CORS-friendly and can be called directly from the browser.

## Quick start

You need **Node 20+** and a Chromium-based browser or Safari (for the Web Speech API).

```bash
git clone https://github.com/pedromussi1/Lyric-Recognizer.git
cd Lyric-Recognizer
npm install
npm run web
```

Open the URL Expo prints, click the microphone, and start singing. That's it — Apple Music links and lyric matching work out of the box.

## Optional: enable the Spotify button

The Spotify integration is opt-in. If you skip this, the Spotify button is hidden and everything else still works.

1. Register an app at <https://developer.spotify.com/dashboard>.
2. In the app's settings, add a redirect URI for local dev (and one for any deployment):
   - `http://localhost:8081/`
   - `https://your-deployed-domain.com/` (when you ship)
3. Copy `.env.example` → `.env` at the project root and paste your Client ID:
   ```
   EXPO_PUBLIC_SPOTIFY_CLIENT_ID=your_client_id_here
   ```
4. Restart `npm run web`.

There is **no client secret** — PKCE uses a per-session code challenge instead, so the Client ID is the only thing you need and it's safe to commit if you want a one-click setup for forks.

When a user clicks the Spotify button on a match for the first time, they're sent to Spotify to sign into their own account. The token is stored in `localStorage` and reused for the rest of the session.

## Project layout

```
.
├── App.tsx                  # main screen
├── app.json                 # Expo config
├── .env.example             # optional Spotify Client ID
└── src/
    ├── components/
    │   ├── RecordButton.tsx
    │   └── MatchCard.tsx
    ├── services/
    │   ├── speech.ts        # Web Speech API wrapper
    │   ├── lyricsMatcher.ts # lyrics.ovh + ranking
    │   ├── spotify.ts       # PKCE OAuth + search
    │   └── appleMusic.ts    # iTunes Search API (no auth)
    ├── utils/
    │   └── similarity.ts    # token + bigram similarity
    └── types/index.ts
```

## Roadmap

- **iOS native**: the speech step uses the browser-only Web Speech API. To run on a real iOS device we'd swap that single service for [`expo-speech-recognition`](https://docs.expo.dev/) or `@react-native-voice/voice`, and replace the PKCE redirect with [`expo-auth-session`](https://docs.expo.dev/versions/latest/sdk/auth-session/). The rest of the app is already platform-neutral.
- **Better matching**: replace the bigram similarity with embeddings (e.g. small sentence-transformer) for handling sung filler syllables and misheard words.
- **Whisper upgrade**: optional toggle to send audio to Whisper instead of Web Speech for users who care about quality more than free.
- **Inline playback**: embed the Spotify and Apple Music players directly in the app instead of opening externally.

## Tech

- [Expo](https://expo.dev/) (React Native + Web)
- TypeScript
- [lyrics.ovh](https://lyricsovh.docs.apiary.io/) — public lyrics API
- [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/) — Apple Music links, no auth
- [Spotify Web API](https://developer.spotify.com/documentation/web-api) with [Authorization Code + PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow) — entirely client-side
- Web Speech API for voice capture
