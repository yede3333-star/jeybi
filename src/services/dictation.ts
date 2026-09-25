// Continuous dictation for "اكتب يومك": the phone's recogniser stops after every pause, so this
// keeps restarting it until the user presses Stop, and appends each finished piece after the
// previous one. The engine (Android plugin or Web Speech API) is behind a small interface so the
// logic is tested without a microphone (src/tests/dictation.test.ts).

export type DictationEnd = 'user' | 'silence' | 'max' | 'background' | 'unavailable' | 'denied' | 'network' | 'other';

export interface EngineHandlers {
  /** Text of the piece being spoken now (replaces the previous partial). */
  partial(text: string): void;
  /** A finished piece. */
  final(text: string): void;
  /** The recogniser ended its session (pause, end of speech…). */
  ended(): void;
  error(code: 'noSpeech' | 'unavailable' | 'denied' | 'network' | 'other'): void;
}

export interface SpeechEngine {
  start(lang: string, h: EngineHandlers): Promise<void>;
  stop(): Promise<void>;
}

export interface DictationCallbacks {
  onPartial(text: string): void;
  onCommit(piece: string): void;
  onEnd(reason: DictationEnd): void;
}

export const DICTATION_LIMITS = { silenceMs: 8_000, maxMs: 180_000, restartDelayMs: 150, maxErrorsInARow: 4 };

export class Dictation {
  private active = false;
  private partialText = '';
  private lastCommitted = '';
  private startedAt = 0;
  private lastVoiceAt = 0;
  private errors = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private engine: SpeechEngine,
    private lang: string,
    private cb: DictationCallbacks,
    private limits = DICTATION_LIMITS,
    private now: () => number = () => Date.now(),
  ) {}

  get listening() { return this.active; }
  get elapsedMs() { return this.active ? this.now() - this.startedAt : 0; }

  async start() {
    if (this.active) return;
    this.active = true;
    this.startedAt = this.lastVoiceAt = this.now();
    this.timer = setInterval(() => this.check(), 500);
    await this.session();
  }

  /** Stops for good; whatever was heard so far is kept (committed). */
  async stop(reason: DictationEnd = 'user') {
    if (!this.active) return;
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.flush();
    try { await this.engine.stop(); } catch { /* already stopped */ }
    this.cb.onEnd(reason);
  }

  private check() {
    if (!this.active) return;
    const t = this.now();
    if (t - this.startedAt >= this.limits.maxMs) void this.stop('max');
    else if (t - this.lastVoiceAt >= this.limits.silenceMs) void this.stop('silence');
  }

  private async session() {
    if (!this.active) return;
    try {
      await this.engine.start(this.lang, {
        partial: (text) => {
          if (!this.active) return;
          const v = text.trim();
          if (v && v !== this.partialText) { this.partialText = v; this.lastVoiceAt = this.now(); this.errors = 0; this.cb.onPartial(v); }
        },
        final: (text) => { this.commit(text); },
        ended: () => this.restart(),
        error: (code) => {
          if (code === 'noSpeech') return this.restart(); // a pause: just listen again
          if (code === 'unavailable' || code === 'denied' || code === 'network') return void this.stop(code);
          if (++this.errors >= this.limits.maxErrorsInARow) return void this.stop('other');
          this.restart();
        },
      });
    } catch (e) {
      const code = (e as { code?: DictationEnd }).code;
      void this.stop(code && code !== 'user' ? code : 'other');
    }
  }

  private restart() {
    this.flush();
    if (!this.active) return;
    setTimeout(() => void this.session(), this.limits.restartDelayMs);
  }

  /** A pending partial becomes a finished piece (the recogniser ended without a final result). */
  private flush() {
    if (this.partialText) this.commit(this.partialText);
  }

  private commit(text: string) {
    const v = text.trim();
    this.partialText = '';
    this.cb.onPartial('');
    // the same piece can arrive twice (final result + end of session): keep it once
    if (!v || v === this.lastCommitted) return;
    this.lastCommitted = v;
    this.lastVoiceAt = this.now();
    this.errors = 0;
    this.cb.onCommit(v);
  }
}

/** Appends a spoken piece after the existing text, separated by "، ". */
export function appendPiece(text: string, piece: string, sep = '، '): string {
  const t = text.replace(/[\s،,]+$/u, '');
  return t ? `${t}${sep}${piece}` : piece;
}
