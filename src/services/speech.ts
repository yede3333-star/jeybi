// Voice input for "اكتب يومك": the phone's recogniser in the Android app, the Web Speech API in a
// browser that has one (Chrome sends the audio to Google for recognition). Hidden when neither
// exists. Continuous listening (restarts, pieces, limits) is in services/dictation.ts.
import { isNative, native } from '../platform';
import type { SpeechEngine } from './dictation';

interface WebRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => WebRecognition;
const WebSpeech = (): RecognitionCtor | undefined =>
  (window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

export async function speechAvailable(): Promise<boolean> {
  if (isNative) return (await native()).speechAvailable();
  return !!WebSpeech();
}

/** Language tag for the recogniser, from the app's language. */
export const speechLang = (lang: 'ar' | 'fr') => (lang === 'ar' ? 'ar-SA' : 'fr-FR');

/** Web Speech API in continuous mode; when the browser still ends the session, the dictation restarts it. */
function webSpeechEngine(): SpeechEngine {
  let rec: WebRecognition | null = null;
  return {
    async start(lang, h) {
      const Ctor = WebSpeech();
      if (!Ctor) throw { code: 'unavailable' };
      const r = new Ctor();
      rec = r;
      r.lang = lang;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      let failed = false;
      r.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) h.final(res[0].transcript);
          else interim += res[0].transcript;
        }
        h.partial(interim);
      };
      r.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return; // onend follows and restarts
        failed = true;
        h.error(e.error === 'network' ? 'network' : e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : 'other');
      };
      r.onend = () => { if (rec === r && !failed) h.ended(); };
      r.start();
    },
    async stop() {
      const r = rec;
      rec = null;
      r?.stop();
    },
  };
}

export async function createSpeechEngine(): Promise<SpeechEngine> {
  return isNative ? (await native()).androidSpeechEngine() : webSpeechEngine();
}
