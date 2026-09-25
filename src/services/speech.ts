// Voice input for "اكتب يومك": the phone's recogniser in the Android app, the Web Speech API in a
// browser that has one (Chrome sends the audio to Google for recognition). Hidden when neither exists.
import { isNative, native } from '../platform';

export type SpeechFailure = 'unavailable' | 'denied' | 'network' | 'noSpeech' | 'cancelled' | 'other';

interface WebRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
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

/** Rejects with `{ code: SpeechFailure }`. */
export async function listen(lang: 'ar' | 'fr'): Promise<string> {
  if (isNative) {
    const n = await native();
    try {
      return await n.listenOnce(speechLang(lang));
    } catch (e) {
      throw { code: e instanceof n.SpeechError ? e.code : 'other' };
    }
  }
  const Ctor = WebSpeech();
  if (!Ctor) throw { code: 'unavailable' };
  return new Promise((resolve, reject) => {
    const r = new Ctor();
    r.lang = speechLang(lang);
    r.interimResults = false;
    r.maxAlternatives = 1;
    let heard = '';
    r.onresult = (e) => { heard = Array.from(e.results).map((x) => x[0].transcript).join(' '); };
    r.onerror = (e) => {
      const map: Record<string, SpeechFailure> = {
        network: 'network', 'not-allowed': 'denied', 'service-not-allowed': 'denied', 'no-speech': 'noSpeech', aborted: 'cancelled',
      };
      reject({ code: map[e.error] ?? 'other' });
    };
    r.onend = () => resolve(heard);
    r.start();
  });
}
