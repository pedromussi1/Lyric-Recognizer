# Lyric Recognizer

Sing or speak the lyrics to a song and get a ranked list of likely matches with one-tap links to Spotify and Apple Music. Built with Expo + React Native, so the same codebase runs on web today and is set up to ship to iOS later.

## How it works

1. **Capture** — the browser's Web Speech API transcribes your voice in real time.
2. **Search** — the transcript is sent to the [lyrics.ovh](https://lyricsovh.docs.apiary.io/) suggest endpoint, which returns candidate songs.
3. **Rank** — for the top candidates we fetch the full lyrics and score each against your transcript using a token + bigram similarity. Results are ordered by confidence (rank-weighted) and a 0–100% match score.
4. **Listen** — each match is enriched with a Spotify search (via a tiny Express proxy that holds the client secret) and the public iTunes Search API for an Apple Music link.

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
              Spotify Web API (via /server)      iTunes Search API
```

## Quick start

You need **Node 20+**, a [Spotify developer app](https://developer.spotify.com/dashboard) (for client ID + secret), and a Chromium-based browser or Safari for the Web Speech API.

```bash
git clone https://github.com/pedromussi1/Lyric-Recognizer.git
cd Lyric-Recognizer

# Frontend
npm install

# Backend (Spotify proxy)
cd server
npm install
cp .env.example .env   # fill in SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET
cd ..
```

Run the backend and the web app in two terminals:

```bash
# Terminal 1 — Spotify proxy on http://localhost:4000
cd server && npm run dev

# Terminal 2 — Expo web app on http://localhost:8081
npm run web
```

Open the web URL Expo prints, click the microphone, and start singing.

## Project layout

```
.
├── App.tsx                  # main screen
├── app.json                 # Expo config
├── src/
│   ├── components/
│   │   ├── RecordButton.tsx
│   │   └── MatchCard.tsx
│   ├── services/
│   │   ├── speech.ts        # Web Speech API wrapper
│   │   ├── lyricsMatcher.ts # lyrics.ovh + ranking
│   │   ├── spotify.ts       # talks to /server
│   │   └── appleMusic.ts    # iTunes Search API (no auth)
│   ├── utils/
│   │   └── similarity.ts    # token + bigram similarity
│   └── types/index.ts
└── server/
    ├── src/index.ts         # Express + Spotify Client Credentials
    └── .env.example
```

## Roadmap

- **iOS native**: the speech step uses the browser-only Web Speech API. To run on a real iOS device we'd swap that single service for [`expo-speech-recognition`](https://docs.expo.dev/) or `@react-native-voice/voice` — the rest of the app is already platform-neutral.
- **Better matching**: replace the bigram similarity with embeddings (e.g. small sentence-transformer) for handling sung filler syllables and misheard words.
- **Whisper upgrade**: optional toggle to send audio to Whisper instead of Web Speech for users who care about quality more than free.
- **Playback**: embed the Spotify and Apple Music players inline instead of opening externally.

## Tech

- [Expo](https://expo.dev/) (React Native + Web)
- TypeScript
- [lyrics.ovh](https://lyricsovh.docs.apiary.io/) — public lyrics API
- [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/) — Apple Music links, no auth
- [Spotify Web API](https://developer.spotify.com/documentation/web-api) — Client Credentials flow proxied through Express
- Web Speech API for voice capture
