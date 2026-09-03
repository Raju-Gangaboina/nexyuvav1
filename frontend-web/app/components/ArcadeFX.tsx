'use client';
/*
 * Shared arcade FX system (extracted from the landing page's inline script)
 * so every inner page (auth, student, company, admin) can share ONE
 * implementation of: 8-bit SFX synth, toast queue, and the Konami code
 * easter egg — instead of copy-pasting the vanilla-JS block per page.
 *
 * Usage in any page:
 *   const { toast, playSound, ArcadeToasts } = useArcadeFX();
 *   ...
 *   toast('SAVED', 'Profile updated', playSound.beep);
 *   return <>{ArcadeToasts}...</>;
 */
import { useEffect, useRef, useState, useCallback, ReactNode } from 'react';

type ToastItem = { id: number; title: string; msg: string; leaving?: boolean };

function makeSFX(getAC: () => AudioContext | null, mutedRef: React.MutableRefObject<boolean>) {
  function tone(f: number, d: number, t?: number) {
    if (mutedRef.current) return;
    try {
      const AC = getAC();
      if (!AC) return;
      const o = AC.createOscillator();
      const g = AC.createGain();
      o.type = 'square';
      o.frequency.value = f;
      const st = AC.currentTime + (t || 0);
      g.gain.setValueAtTime(0.045, st);
      g.gain.exponentialRampToValueAtTime(0.001, st + (d || 0.08));
      o.connect(g);
      g.connect(AC.destination);
      o.start(st);
      o.stop(st + (d || 0.08) + 0.02);
    } catch {
      /* no-op: audio unsupported/blocked */
    }
  }
  return {
    blip: () => tone(880, 0.05),
    beep: () => tone(660, 0.07),
    collect: () => { tone(880, 0.06, 0); tone(1108, 0.06, 0.06); tone(1318, 0.09, 0.12); },
    ach: () => { tone(523, 0.09, 0); tone(659, 0.09, 0.09); tone(784, 0.09, 0.18); tone(1046, 0.16, 0.27); },
    start: () => { tone(262, 0.09, 0); tone(392, 0.09, 0.09); tone(523, 0.09, 0.18); tone(784, 0.2, 0.27); },
    god: () => { tone(392, 0.1, 0); tone(523, 0.1, 0.1); tone(659, 0.1, 0.2); tone(784, 0.1, 0.3); tone(1046, 0.3, 0.4); },
  };
}

const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];

export function useArcadeFX() {
  const acRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const getAC = useCallback(() => {
    if (!acRef.current && typeof window !== 'undefined') {
      acRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    }
    return acRef.current;
  }, []);

  const playSound = makeSFX(getAC, mutedRef);

  const toast = useCallback((title: string, msg: string, snd?: () => void) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, title, msg }]);
    if (snd) snd();
    setTimeout(() => setToasts(prev => prev.map(t => (t.id === id ? { ...t, leaving: true } : t))), 4200);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4600);
  }, []);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    if (!mutedRef.current) playSound.beep();
  }, [playSound]);

  // Konami code — global easter egg on every page that mounts this hook
  useEffect(() => {
    let kIdx = 0;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === KONAMI[kIdx]) {
        kIdx++;
        if (kIdx === KONAMI.length) {
          kIdx = 0;
          playSound.god();
          toast('GOD MODE', 'ALL 7 AGENTS BEFRIENDED. +9999 PTS');
        }
      } else {
        kIdx = k === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ArcadeToasts: ReactNode = (
    <div className="arcade-toasts" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`arcade-toast${t.leaving ? ' out' : ''}`}>
          <div className="at-head">★ {t.title}</div>
          <div className="at-body">{t.msg}</div>
        </div>
      ))}
    </div>
  );

  return { toast, playSound, muted, toggleMute, ArcadeToasts };
}

/** Attach hover blip SFX to any element via onMouseEnter — convenience helper. */
export function hoverBlip(playSound: ReturnType<typeof makeSFX>) {
  return () => playSound.blip();
}
