export type SongMatch = {
  artist: string;
  title: string;
  confidence: number;
  matchPercent: number;
  matchedPhrase: string;
  artworkUrl?: string;
  previewUrl?: string;
  appleMusicUrl?: string;
};

export type LyricsOvhSuggestion = {
  title: string;
  preview?: string;
  artist: { name: string };
  album?: { cover_medium?: string; cover_small?: string };
};
