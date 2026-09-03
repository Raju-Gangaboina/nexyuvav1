// Generated content lookup, produced by scripts/import-roadmap-content.mjs
// from developer-roadmap's markdown files. Static import (build-time), not a
// runtime dependency on the developer-roadmap folder.
import frontend from './roadmap-content/frontend.json';
import backend from './roadmap-content/backend.json';
import fullstack from './roadmap-content/fullstack.json';
import dataAi from './roadmap-content/data-ai.json';
import devops from './roadmap-content/devops.json';
import cybersecurity from './roadmap-content/cybersecurity.json';
import mobile from './roadmap-content/mobile.json';
import uiux from './roadmap-content/uiux.json';
import cloud from './roadmap-content/cloud.json';

export interface TopicResource { type: string; label: string; url: string; sourceSlug?: string }
export interface TopicContent { description: string; resources: TopicResource[]; sourceSlug?: string }

const ROADMAP_CONTENT: Record<string, Record<string, TopicContent>> = {
  frontend, backend, fullstack, 'data-ai': dataAi, devops, cybersecurity, mobile, uiux, cloud,
};

// Looks up richer content (description + curated resource links) for a topic,
// sourced from developer-roadmap. Returns null if this topic wasn't matched
// during import -- callers should fall back to the topic's own `note` field.
export function getTopicContent(roadmapId: string, topicTitle: string): TopicContent | null {
  return ROADMAP_CONTENT[roadmapId]?.[topicTitle] ?? null;
}
