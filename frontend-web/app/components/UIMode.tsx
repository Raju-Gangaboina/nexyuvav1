'use client';
import { createContext, useContext, useEffect, useState } from 'react';

export type UIMode = 'arcade' | 'classic';

const STORAGE_KEY = 'nexyuva-ui-mode';

type Ctx = { mode: UIMode; toggleMode: () => void; setMode: (m: UIMode) => void };

const UIModeContext = createContext<Ctx>({
  mode: 'arcade',
  toggleMode: () => {},
  setMode: () => {},
});

export function UIModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<UIMode>('arcade');

  // Read persisted preference after mount (avoids SSR/CSR mismatch);
  // the inline script in layout.tsx already set data-ui on <html>
  // before paint, so there's no flash either way.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as UIMode | null;
    if (saved === 'arcade' || saved === 'classic') setModeState(saved);
  }, []);

  const setMode = (m: UIMode) => {
    setModeState(m);
    window.localStorage.setItem(STORAGE_KEY, m);
    document.documentElement.setAttribute('data-ui', m);
  };

  const toggleMode = () => setMode(mode === 'arcade' ? 'classic' : 'arcade');

  return (
    <UIModeContext.Provider value={{ mode, toggleMode, setMode }}>
      {children}
    </UIModeContext.Provider>
  );
}

export function useUIMode() {
  return useContext(UIModeContext);
}

/** Small pill switch -- drop into any topbar/header. */
export default function UIModeToggle({ style }: { style?: React.CSSProperties }) {
  const { mode, toggleMode } = useUIMode();
  const arcade = mode === 'arcade';
  return (
    <button
      onClick={toggleMode}
      title={arcade ? 'Switch to Classic UI' : 'Switch to Arcade UI'}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px',
        background: arcade ? '#fff' : '#161619',
        color: arcade ? '#0A0A0A' : '#E8E6E1',
        border: `2px solid ${arcade ? '#0A0A0A' : 'rgba(232,230,225,0.18)'}`,
        borderRadius: arcade ? 0 : 6,
        boxShadow: arcade ? '3px 3px 0 #0A0A0A' : '0 2px 10px rgba(0,0,0,0.35)',
        fontFamily: arcade ? "'JetBrains Mono', monospace" : "'Inter', sans-serif",
        fontSize: 11, fontWeight: 700, letterSpacing: '0.03em',
        textTransform: 'uppercase', cursor: 'pointer',
        transition: 'transform 0.1s ease',
        ...style,
      }}
    >
      <span>{arcade ? '🕹️' : '🌙'}</span>
      <span>{arcade ? 'Arcade' : 'Classic'}</span>
    </button>
  );
}
