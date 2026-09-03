'use client';
import { useCallback, useEffect, useState } from 'react';

// Per-topic learning status, roadmap.sh-style: Learning / Done / Skip.
// Persisted client-side only (localStorage) -- there's no backend
// user-progress table yet, and this is purely a personal, low-stakes
// UI preference, so a server round-trip isn't worth it. Keyed by
// `${roadmapId}::${topicTitle}` so the same topic title in two different
// roadmaps (rare, but possible) doesn't collide.

export type TopicStatus = 'learning' | 'done' | 'skip';

const STORAGE_KEY = 'nexyuva.roadmap.topicStatus.v1';
// Fired on every write so any number of components (canvas + panel, or two
// canvases on screen at once) stay in sync without prop-drilling a shared
// store -- same pattern as a tiny pub/sub, just riding on a DOM event.
const EVENT_NAME = 'nexyuva:topic-status-changed';

type StatusMap = Record<string, TopicStatus>;

function readAll(): StatusMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as StatusMap : {};
  } catch {
    return {};
  }
}

function writeAll(map: StatusMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // localStorage unavailable (private browsing, quota) -- fail silently,
    // status just won't persist across reloads this session.
  }
}

function keyFor(roadmapId: string, topicTitle: string): string {
  return `${roadmapId}::${topicTitle}`;
}

export function getTopicStatus(roadmapId: string, topicTitle: string): TopicStatus | null {
  return readAll()[keyFor(roadmapId, topicTitle)] ?? null;
}

// Setting the same status again clears it (click Done twice -> back to
// "not started"), matching the toggle behavior in the reference screenshots.
export function setTopicStatus(roadmapId: string, topicTitle: string, status: TopicStatus) {
  const all = readAll();
  const key = keyFor(roadmapId, topicTitle);
  if (all[key] === status) {
    delete all[key];
  } else {
    all[key] = status;
  }
  writeAll(all);
}

// Hook: returns the full status map for one roadmap (title -> status) plus
// a setter, and stays in sync across every component using this hook.
export function useTopicStatusMap(roadmapId: string): [StatusMap, (topicTitle: string, status: TopicStatus) => void] {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onChange = () => setVersion(v => v + 1);
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener('storage', onChange); // cross-tab
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const map: StatusMap = {};
  const all = readAll();
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(`${roadmapId}::`)) {
      map[k.slice(roadmapId.length + 2)] = v;
    }
  }
  // `version` is intentionally unused beyond triggering the re-render/re-read above.
  void version;

  const set = useCallback((topicTitle: string, status: TopicStatus) => {
    setTopicStatus(roadmapId, topicTitle, status);
  }, [roadmapId]);

  return [map, set];
}
