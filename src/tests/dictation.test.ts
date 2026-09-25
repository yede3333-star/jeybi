// Section 5: continuous dictation keeps listening across pauses until Stop.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendPiece, Dictation, type DictationEnd, type EngineHandlers, type SpeechEngine } from '../services/dictation';

class FakeEngine implements SpeechEngine {
  h: EngineHandlers | null = null;
  starts = 0;
  stops = 0;
  failStart: unknown = null;
  async start(_lang: string, h: EngineHandlers) {
    if (this.failStart) throw this.failStart;
    this.starts++;
    this.h = h;
  }
  async stop() { this.stops++; }
}

function setup() {
  let clock = 0;
  const engine = new FakeEngine();
  const out = { partial: '', pieces: [] as string[], ended: null as DictationEnd | null };
  const d = new Dictation(engine, 'ar-SA', {
    onPartial: (t) => { out.partial = t; },
    onCommit: (p) => { out.pieces.push(p); },
    onEnd: (r) => { out.ended = r; },
  }, { silenceMs: 8000, maxMs: 180_000, restartDelayMs: 150, maxErrorsInARow: 4 }, () => clock);
  const tick = async (ms: number) => { clock += ms; await vi.advanceTimersByTimeAsync(ms); };
  return { d, engine, out, tick };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('continuous dictation', () => {
  it('shows the text while speaking, and restarts after each pause, appending the pieces', async () => {
    const { d, engine, out, tick } = setup();
    await d.start();
    engine.h!.partial('تاكسي');
    expect(out.partial).toBe('تاكسي');
    engine.h!.partial('تاكسي 10');
    engine.h!.ended(); // Android ends the session at the first pause
    expect(out.pieces).toEqual(['تاكسي 10']);
    await tick(200);
    expect(engine.starts).toBe(2); // restarted by itself
    engine.h!.partial('خبز 50');
    engine.h!.final('خبز 50');
    engine.h!.ended(); // same piece again: kept once
    await tick(200);
    expect(out.pieces).toEqual(['تاكسي 10', 'خبز 50']);
    expect(d.listening).toBe(true);
    await d.stop();
    expect(out.ended).toBe('user');
    expect(engine.stops).toBe(1);
  });

  it('a silent restart ("no speech") does not stop; 8 s of real silence does, keeping the text', async () => {
    const { d, engine, out, tick } = setup();
    await d.start();
    engine.h!.partial('رصيد 200');
    await tick(3000);
    engine.h!.error('noSpeech');
    await tick(200);
    expect(d.listening).toBe(true);
    expect(out.pieces).toEqual(['رصيد 200']);
    await tick(8000);
    expect(d.listening).toBe(false);
    expect(out.ended).toBe('silence');
  });

  it('stops after 3 minutes even while speaking', async () => {
    const { d, engine, out, tick } = setup();
    await d.start();
    for (let i = 0; i < 40; i++) { engine.h!.partial(`كلمة ${i}`); await tick(5000); }
    expect(out.ended).toBe('max');
  });

  it('Stop keeps what was being said (pending partial)', async () => {
    const { d, engine, out } = setup();
    await d.start();
    engine.h!.partial('عشاء 300');
    await d.stop('background');
    expect(out.pieces).toEqual(['عشاء 300']);
    expect(out.ended).toBe('background');
  });

  it('network / permission problems stop with that reason; repeated odd errors stop too', async () => {
    const a = setup();
    await a.d.start();
    a.engine.h!.error('network');
    await a.tick(10);
    expect(a.out.ended).toBe('network');
    const b = setup();
    await b.d.start();
    for (let i = 0; i < 4; i++) { b.engine.h!.error('other'); await b.tick(200); }
    expect(b.out.ended).toBe('other');
    const c = setup();
    c.engine.failStart = { code: 'denied' };
    await c.d.start();
    expect(c.out.ended).toBe('denied');
  });

  it('pieces go after the existing text with "، "', () => {
    expect(appendPiece('', 'خبز 50')).toBe('خبز 50');
    expect(appendPiece('خبز 50', 'تاكسي 100')).toBe('خبز 50، تاكسي 100');
    expect(appendPiece('خبز 50، ', 'تاكسي 100')).toBe('خبز 50، تاكسي 100');
  });
});
