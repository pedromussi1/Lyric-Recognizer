import { Platform } from 'react-native';

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }>> & {
    [index: number]: ArrayLike<{ transcript: string; confidence?: number }> & {
      isFinal: boolean;
    };
  };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export type SpeechHandlers = {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (message: string) => void;
  onEnd: () => void;
};

export type SpeechController = {
  stop: () => void;
};

/**
 * Start the Web Speech API recognizer. On non-web platforms, returns null
 * and surfaces an error through the handler — iOS native support will need
 * expo-speech-recognition or @react-native-voice/voice.
 */
export function startRecognition(handlers: SpeechHandlers): SpeechController | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    handlers.onError(
      'Speech recognition is only available in web browsers right now (Chrome, Safari, or Edge).',
    );
    return null;
  }

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  // event.results is the cumulative list of all results since the session
  // started — finalized and interim. We rebuild the transcript from scratch
  // on every event so finalized chunks don't get appended repeatedly.
  let lastFinal = '';

  recognition.onresult = (event) => {
    let final = '';
    let interim = '';
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const alt = result[0];
      if (!alt) continue;
      if (result.isFinal) {
        final += alt.transcript + ' ';
      } else {
        interim += alt.transcript;
      }
    }
    lastFinal = final.trim();
    const combined = (final + interim).trim();
    handlers.onTranscript(combined, false);
  };

  recognition.onerror = (e) => {
    handlers.onError(e.error || 'Speech recognition error');
  };

  recognition.onend = () => {
    handlers.onTranscript(lastFinal, true);
    handlers.onEnd();
  };

  recognition.start();

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        recognition.abort();
      }
    },
  };
}
