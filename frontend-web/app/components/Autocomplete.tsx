'use client';
import { useState, useEffect, useRef } from 'react';

interface AutocompleteProps<T> {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: T) => void;
  fetchOptions: (query: string) => Promise<T[]>;
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string;
  placeholder?: string;
  id?: string;
}

/**
 * Debounced text input + dropdown, backed by an async lookup (colleges or
 * cities). Free typing is always allowed - selecting a suggestion just
 * fills the field faster and more consistently; it doesn't gate submission,
 * since the self-hosted AISHE college list and countries.dev cities list
 * are both best-effort, not exhaustive.
 */
export default function Autocomplete<T>({
  value, onChange, onSelect, fetchOptions, getLabel, getSubLabel, placeholder, id,
}: AutocompleteProps<T>) {
  const [options, setOptions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (text: string) => {
    onChange(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setOptions([]);
      setOpen(false);
      return;
    }
    const thisRequestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fetchOptions(text);
        // Ignore stale responses that resolve out of order.
        if (thisRequestId === requestIdRef.current) {
          setOptions(results);
          // Keep the dropdown open even with zero matches, so we can show
          // a reassuring 'not in our list, but you can still type it in'
          // message - the college/city lists are best-effort (AISHE covers
          // ~43k colleges, countries.dev covers major towns), not
          // exhaustive, and students from smaller institutions or rural
          // areas that aren't indexed should never feel blocked.
          setOpen(true);
        }
      } finally {
        if (thisRequestId === requestIdRef.current) setLoading(false);
      }
    }, 300);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        id={id}
        className="input-field"
        placeholder={placeholder}
        value={value}
        onChange={e => handleInputChange(e.target.value)}
        onFocus={() => { if (options.length > 0) setOpen(true); }}
        autoComplete="off"
      />
      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
            background: '#fff', border: '3px solid #0A0A0A',
            borderRadius: 0, maxHeight: 220, overflowY: 'auto', zIndex: 20,
            boxShadow: '5px 5px 0 #0A0A0A',
          }}
        >
          {options.map((opt, i) => (
            <div
              key={i}
              onClick={() => {
                onSelect(opt);
                setOpen(false);
              }}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                fontFamily: 'var(--font-mono)', color: '#0A0A0A',
                borderBottom: i < options.length - 1 ? '1px solid var(--glass-border)' : 'none',
              }}
              onMouseDown={e => e.preventDefault()}
            >
              <div>{getLabel(opt)}</div>
              {getSubLabel && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{getSubLabel(opt)}</div>
              )}
            </div>
          ))}
          {loading && options.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Searching...</div>
          )}
          {!loading && options.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
              No match found - no problem, what you've typed will be saved as-is.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
