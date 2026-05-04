import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SongMatch } from '../types';

type Props = {
  match: SongMatch;
  rank: number;
};

function openUrl(url?: string) {
  if (!url) return;
  Linking.openURL(url).catch(() => {});
}

export function MatchCard({ match, rank }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.rank}>#{rank}</Text>
        {match.artworkUrl ? (
          <Image source={{ uri: match.artworkUrl }} style={styles.art} />
        ) : (
          <View style={[styles.art, styles.artFallback]}>
            <Text style={styles.artFallbackText}>♪</Text>
          </View>
        )}
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {match.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {match.artist}
          </Text>
        </View>
      </View>

      <View style={styles.scoreRow}>
        <Text style={styles.scoreLabel}>Match</Text>
        <View style={styles.scoreBarTrack}>
          <View
            style={[styles.scoreBarFill, { width: `${match.matchPercent}%` }]}
          />
        </View>
        <Text style={styles.scoreValue}>{match.matchPercent}%</Text>
      </View>

      {match.matchedPhrase ? (
        <Text style={styles.phrase} numberOfLines={2}>
          “{match.matchedPhrase}”
        </Text>
      ) : null}

      <View style={styles.actions}>
        {match.spotifyUrl ? (
          <Pressable
            style={[styles.actionBtn, styles.spotifyBtn]}
            onPress={() => openUrl(match.spotifyUrl)}
          >
            <Text style={styles.actionText}>Spotify</Text>
          </Pressable>
        ) : null}
        {match.appleMusicUrl ? (
          <Pressable
            style={[styles.actionBtn, styles.appleBtn]}
            onPress={() => openUrl(match.appleMusicUrl)}
          >
            <Text style={styles.actionText}>Apple Music</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rank: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '700',
    width: 28,
  },
  art: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#2a2a3e',
  },
  artFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  artFallbackText: {
    color: '#9ca3af',
    fontSize: 28,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  artist: {
    color: '#9ca3af',
    fontSize: 13,
    marginTop: 2,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 8,
  },
  scoreLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    width: 44,
  },
  scoreBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#2a2a3e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  scoreBarFill: {
    height: '100%',
    backgroundColor: '#a855f7',
    borderRadius: 3,
  },
  scoreValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    width: 44,
    textAlign: 'right',
  },
  phrase: {
    color: '#c4b5fd',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  spotifyBtn: {
    backgroundColor: '#1db954',
  },
  appleBtn: {
    backgroundColor: '#fa2d48',
  },
  actionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
