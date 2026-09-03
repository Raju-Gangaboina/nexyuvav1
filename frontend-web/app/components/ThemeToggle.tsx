'use client';

// Dark mode has been removed platform-wide (NexYuva is light-only now).
// This component is kept as a no-op so existing imports in the dashboard
// layouts don't need to be touched — it renders nothing and always reports
// 'light', so nothing can flip data-theme back to dark.
type Theme = 'dark' | 'light';

export function useTheme() {
  const theme: Theme = 'light';
  const setTheme = (_next: Theme) => { /* no-op: dark mode removed */ };
  const toggleTheme = () => { /* no-op: dark mode removed */ };
  return { theme, setTheme, toggleTheme };
}

export default function ThemeToggle(_props: { style?: React.CSSProperties }) {
  return null;
}
