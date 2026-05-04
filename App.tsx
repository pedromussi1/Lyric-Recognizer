import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
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
import { findSpotifyUrl } from './src/services/spotify';
import type { SongMatch } from './src/types';

export default function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [results, setResults] = useState<SongMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<SpeechController | null>(null);
  const supported = isSpeechSupported();

  const runSearch = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const matches = await findMatches(text);
      // Enrich each match with Spotify + Apple Music links in parallel.
      const enriched = await Promise.all(
        matches.map(async (m) => {
          const [spotify, apple] = await Promise.all([
            findSpotifyUrl(m.artist, m.title),
            findAppleMusicUrl(m.artist, m.title),
          ]);
          return {
            ...m,
            spotifyUrl: spotify.url,
            appleMusicUrl: apple.url,
            artworkUrl: m.artworkUrl ?? apple.artworkUrl ?? spotify.artworkUrl,
            previewUrl: m.previewUrl ?? spotify.previewUrl ?? apple.previewUrl,
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
    setResults([]);
    setTranscript('');
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
            <Text style={styles.transcriptLabel}>You sang</Text>
            <Text style={styles.transcript}>{transcript}</Text>
          </View>
        ) : null}

        {isSearching ? (
          <View style={styles.searching}>
            <ActivityIndicator color="#a855f7" />
            <Text style={styles.searchingText}>Matching lyrics…</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {results.length > 0 ? (
          <View style={styles.results}>
            <Text style={styles.resultsHeading}>Top matches</Text>
            {results.map((m, i) => (
              <MatchCard
                key={`${m.artist}-${m.title}-${i}`}
                match={m}
                rank={i + 1}
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
  transcriptLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transcript: {
    color: '#fff',
    fontSize: 16,
    marginTop: 6,
    lineHeight: 22,
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
