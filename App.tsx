import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MatchCard } from './src/components/MatchCard';
import { RecordButton } from './src/components/RecordButton';
import { findAppleMusicUrl } from './src/services/appleMusic';
import { findMatches } from './src/services/lyricsMatcher';
import {
  isSpeechSupported,
  startRecognition,
  type SpeechController,
} from './src/services/speech';
import {
  handleSpotifyCallback,
  isSpotifyConfigured,
  listenForSpotifyAuth,
  openOnSpotify,
} from './src/services/spotify';
import type { SongMatch } from './src/types';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [results, setResults] = useState<SongMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const controller = useRef<SpeechController | null>(null);
  const supported = isSpeechSupported();
  const spotifyEnabled = isSpotifyConfigured();

  // On mount, two things:
  //  1) If we landed here via the same-tab OAuth fallback (popup blocker
  //     caught the new tab), finish the exchange and resume.
  //  2) Listen for status messages from Spotify auth popup tabs so we can
  //     show "Opened on Spotify" / error feedback in the original tab.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const pending = await handleSpotifyCallback();
      if (cancelled || !pending) return;
      setStatusMessage(`Opening "${pending.title}" on Spotify…`);
      const result = await openOnSpotify(pending.artist, pending.title);
      if (cancelled) return;
      if (result.status === 'opened') {
        setStatusMessage(null);
      } else if (result.status === 'not_found') {
        setStatusMessage("Couldn't find that track on Spotify.");
      } else {
        setStatusMessage(null);
      }
    })();

    const unsubscribe = listenForSpotifyAuth((event) => {
      if (event.kind === 'opened') {
        setStatusMessage(`Opened "${event.title}" on Spotify`);
      } else if (event.kind === 'failed') {
        setStatusMessage(null);
        if (event.reason === 'not_found') {
          setError("Couldn't find that track on Spotify.");
        } else {
          setError('Spotify sign-in failed. Try again.');
        }
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const runSearch = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setIsSearching(true);
    setError(null);
    setResults([]);
    try {
      const matches = await findMatches(text);
      // Apple Music has no auth — we can pre-fetch its link for every match.
      // Spotify is fetched on demand inside openOnSpotify so we never call
      // it without the user's token.
      const enriched = await Promise.all(
        matches.map(async (m) => {
          const apple = await findAppleMusicUrl(m.artist, m.title);
          // Prefer iTunes artwork over the Deezer/lyrics.ovh one — iTunes
          // resolves the canonical studio version, which is usually what
          // the user expects to see, while Deezer often returns the cover
          // of whichever live or remaster variant matched first.
          return {
            ...m,
            appleMusicUrl: apple.url,
            artworkUrl: apple.artworkUrl ?? m.artworkUrl,
            previewUrl: apple.previewUrl ?? m.previewUrl,
          };
        }),
      );
      setResults(enriched);
      if (enriched.length === 0) {
        setError('No matches found. Try singing a few more words.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleStart = useCallback(() => {
    setError(null);
    setStatusMessage(null);
    setResults([]);
    setTranscript('');
    setIsEditing(false);
    const c = startRecognition({
      onTranscript: (text, isFinal) => {
        setTranscript(text);
        if (isFinal && text.trim().length > 0) {
          void runSearch(text);
        }
      },
      onError: (msg) => {
        setError(msg);
        setIsRecording(false);
      },
      onEnd: () => {
        setIsRecording(false);
        controller.current = null;
      },
    });
    if (c) {
      controller.current = c;
      setIsRecording(true);
    }
  }, [runSearch]);

  const handleStop = useCallback(() => {
    controller.current?.stop();
    setIsRecording(false);
  }, []);

  const handleEdit = useCallback(() => {
    if (isRecording) {
      controller.current?.stop();
      setIsRecording(false);
    }
    setIsEditing(true);
  }, [isRecording]);

  const handleSearchEdited = useCallback(() => {
    setIsEditing(false);
    void runSearch(transcript);
  }, [transcript, runSearch]);

  const handleSpotifyPress = useCallback(async (match: SongMatch) => {
    setError(null);
    setStatusMessage(null);
    const result = await openOnSpotify(match.artist, match.title);
    if (result.status === 'authorizing') {
      setStatusMessage('Opening Spotify sign-in in a new tab…');
    } else if (result.status === 'not_found') {
      setError("Couldn't find that track on Spotify.");
    }
  }, []);

  const togglePress = isRecording ? handleStop : handleStart;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Lyric Recognizer</Text>
        <Text style={styles.subtitle}>
          Sing or speak some lyrics — we'll find the song.
        </Text>

        <RecordButton
          isRecording={isRecording}
          disabled={!supported || isSearching}
          onPress={togglePress}
        />

        {!supported ? (
          <Text style={styles.warning}>
            Speech recognition is only available in web browsers (Chrome, Edge,
            or Safari) for now. iOS native support is on the roadmap.
          </Text>
        ) : null}

        {transcript ? (
          <View style={styles.transcriptBox}>
            <View style={styles.transcriptHeader}>
              <Text style={styles.transcriptLabel}>You sang</Text>
              {!isRecording ? (
                <Pressable
                  onPress={isEditing ? handleSearchEdited : handleEdit}
                  hitSlop={8}
                >
                  <Text style={styles.editAction}>
                    {isEditing ? 'Search' : 'Edit'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {isEditing ? (
              <TextInput
                value={transcript}
                onChangeText={setTranscript}
                multiline
                autoFocus
                style={styles.transcriptInput}
                placeholder="Type the lyrics you sang…"
                placeholderTextColor="#6b7280"
              />
            ) : (
              <Text style={styles.transcript}>{transcript}</Text>
            )}
          </View>
        ) : null}

        {isSearching ? (
          <View style={styles.searching}>
            <ActivityIndicator color="#a855f7" />
            <Text style={styles.searchingText}>Matching lyrics…</Text>
          </View>
        ) : null}

        {statusMessage ? <Text style={styles.status}>{statusMessage}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {results.length > 0 ? (
          <View style={styles.results}>
            <Text style={styles.resultsHeading}>Top matches</Text>
            {results.map((m, i) => (
              <MatchCard
                key={`${m.artist}-${m.title}-${i}`}
                match={m}
                rank={i + 1}
                spotifyEnabled={spotifyEnabled}
                onSpotifyPress={() => handleSpotifyPress(m)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a14',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: 48,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
  },
  warning: {
    color: '#fbbf24',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 24,
  },
  transcriptBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  transcriptLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editAction: {
    color: '#a855f7',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transcript: {
    color: '#fff',
    fontSize: 16,
    marginTop: 6,
    lineHeight: 22,
  },
  transcriptInput: {
    color: '#fff',
    fontSize: 16,
    marginTop: 8,
    lineHeight: 22,
    padding: 10,
    minHeight: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a4e',
    backgroundColor: '#0f0f1c',
  },
  searching: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 20,
  },
  searchingText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  status: {
    color: '#a855f7',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  error: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  results: {
    marginTop: 24,
  },
  resultsHeading: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
});
