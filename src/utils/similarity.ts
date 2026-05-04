const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function bigrams(tokens: string[]): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    grams.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return grams;
}

/**
 * Score how well `transcript` matches `lyrics`. Returns 0..1.
 * Combines unigram token overlap with bigram overlap so word order matters.
 */
export function similarityScore(transcript: string, lyrics: string): number {
  const tTokens = tokenize(transcript).filter((t) => !STOPWORDS.has(t));
  const lTokens = tokenize(lyrics);
  if (tTokens.length === 0 || lTokens.length === 0) return 0;

  const lSet = new Set(lTokens);
  const unigramHits = tTokens.filter((t) => lSet.has(t)).length;
  const unigramScore = unigramHits / tTokens.length;

  const tBigrams = bigrams(tTokens);
  const lBigrams = bigrams(lTokens);
  let bigramHits = 0;
  for (const g of tBigrams) {
    if (lBigrams.has(g)) bigramHits++;
  }
  const bigramScore = tBigrams.size > 0 ? bigramHits / tBigrams.size : 0;

  return 0.4 * unigramScore + 0.6 * bigramScore;
}

/**
 * Find the longest contiguous run of transcript tokens that appears in lyrics.
 * Used to surface a "matched phrase" snippet for the UI.
 */
export function longestMatchedPhrase(transcript: string, lyrics: string): string {
  const tTokens = tokenize(transcript);
  const lTokens = tokenize(lyrics);
  if (tTokens.length === 0 || lTokens.length === 0) return '';

  let best: string[] = [];
  for (let i = 0; i < tTokens.length; i++) {
    for (let j = i + 1; j <= tTokens.length; j++) {
      const phrase = tTokens.slice(i, j).join(' ');
      if (phrase.length < 4) continue;
      if (lTokens.join(' ').includes(phrase) && j - i > best.length) {
        best = tTokens.slice(i, j);
      }
    }
  }
  return best.join(' ');
}
