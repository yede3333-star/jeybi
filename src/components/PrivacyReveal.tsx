// Privacy mode, app-wide: marks <html> while amounts are hidden, and a long press on any masked
// amount ("•••••") shows that one amount for 3 seconds in a small bubble. The real figure is read
// from the masked text itself (lib/privacy.ts), so this works on every screen.
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../hooks/settings';
import { isNative, native } from '../platform';
import { isMasked, revealIn } from '../lib/privacy';

const LONG_PRESS_MS = 500;
const SHOW_MS = 3000;

function amountAt(x: number, y: number, target: EventTarget | null): string | null {
  // the text under the finger first (a row can hold several amounts)…
  const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
  const range = doc.caretRangeFromPoint?.(x, y);
  const node = range?.startContainer;
  if (node && node.nodeType === Node.TEXT_NODE && isMasked(node.textContent ?? '')) {
    const r = revealIn(node.textContent ?? '', range!.startOffset);
    if (r.length) return r[0];
  }
  // …else the closest element that holds exactly one masked amount
  let el = target instanceof Element ? target : null;
  for (let i = 0; el && i < 5; i++, el = el.parentElement) {
    const r = revealIn(el.textContent ?? '');
    if (r.length === 1) return r[0];
    if (r.length > 1) break;
  }
  return null;
}

export function PrivacyReveal() {
  const s = useSettings();
  const [bubble, setBubble] = useState<{ x: number; y: number; text: string } | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.documentElement.classList.toggle('amounts-hidden', s.amountsHidden);
    if (!s.amountsHidden) { setBubble(null); return; }
    let timer: number | undefined;
    let start: { x: number; y: number } | null = null;
    let swallowClick = false;
    const down = (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY };
      const target = e.target;
      timer = window.setTimeout(() => {
        const text = amountAt(start!.x, start!.y, target);
        if (!text) return;
        swallowClick = true; // the tap that ends the long press must not also open the row
        navigator.vibrate?.(15);
        setBubble({ x: start!.x, y: start!.y, text });
        window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => setBubble(null), SHOW_MS);
      }, LONG_PRESS_MS);
    };
    const move = (e: PointerEvent) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) window.clearTimeout(timer); };
    const end = () => window.clearTimeout(timer);
    const click = (e: MouseEvent) => { if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); } };
    const menu = (e: Event) => { if (isMasked((e.target as Element | null)?.textContent ?? '')) e.preventDefault(); };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
    document.addEventListener('click', click, true);
    document.addEventListener('contextmenu', menu, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', end, true);
      document.removeEventListener('pointercancel', end, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('contextmenu', menu, true);
    };
  }, [s.amountsHidden]);

  // Android: while hidden (and if chosen), the app is blank in the recent-apps screen
  useEffect(() => {
    if (!isNative) return;
    void native().then((n) => n.setSecureScreen(s.amountsHidden && s.secureWhenHidden));
  }, [s.amountsHidden, s.secureWhenHidden]);

  if (!bubble) return null;
  const left = Math.min(Math.max(bubble.x, 70), window.innerWidth - 70);
  return (
    <div className="pointer-events-none fixed z-[80] -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-lg font-bold text-page shadow-lg" style={{ left, top: Math.max(8, bubble.y - 64) }} role="status">
      <bdi dir="ltr" className="num">{bubble.text}</bdi>
    </div>
  );
}
