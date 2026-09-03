// scripts/import-roadmap-content.mjs
// Reads developer-roadmap's markdown content (title + description + resource
// links per topic) and matches it against NexYuva's existing roadmap topics
// by keyword overlap, writing one JSON file per roadmap to
// frontend-web/lib/roadmap-content/<id>.json.
//
// This is an offline, one-time (re-runnable) import -- nothing in NexYuva
// reads from developer-roadmap at request time. Re-run this script any time
// developer-roadmap content is updated or NexYuva's topic list changes.
//
// Run with: node scripts/import-roadmap-content.mjs

import fs from 'node:fs';
import path from 'node:path';

const DEV_ROADMAP_ROOT = 'C:\\Users\\rajuy\\developer-roadmap\\roadmaps';
const OUT_DIR = path.join(process.cwd(), 'frontend-web', 'lib', 'roadmap-content');

// NexYuva roadmap id -> developer-roadmap slug. Best-effort where there's no
// exact 1:1 (e.g. "mobile" maps to "android" only -- flutter/ios/react-native
// topics in that roadmap won't get matched content).
const SLUG_MAP = {
  frontend: 'frontend',
  backend: 'backend',
  fullstack: 'full-stack',
  'data-ai': 'data-analyst',
  devops: 'devops',
  cybersecurity: 'cyber-security',
  mobile: 'android',
  uiux: 'ux-design',
  cloud: 'aws',
};

// Topic titles as they exist in frontend-web/lib/roadmaps.ts today, kept in
// sync by hand (this script does not parse the .ts file's AST).
const TOPICS_BY_ROADMAP = {
  frontend: ['How the Web Works', 'HTML', 'CSS', 'JavaScript', 'Git & GitHub', 'Responsive & Accessible UI', 'A Framework', 'Package Managers', 'Build Tools', 'TypeScript', 'CSS Frameworks', 'State Management', 'Routing', 'Testing', 'Browser DevTools', 'Working with APIs', 'Web Performance', 'Accessibility (a11y)', 'Frontend Security', 'Authentication in the Browser', 'GraphQL Clients', 'SSR & SSG', 'PWAs', 'Design Systems', 'CI/CD & Deployment', 'Portfolio & Interview Prep'],
  backend: ['A Language', 'Data Structures & Algorithms', 'Version Control', 'OS & Networking Basics', 'A Web Framework', 'REST API Design', 'Relational Databases', 'ORMs', 'Authentication', 'Caching', 'Message Queues', 'NoSQL Databases', 'API Testing', 'Containerization', 'Microservices', 'GraphQL APIs', 'System Design', 'Observability'],
  fullstack: ['HTML/CSS/JS', 'A Backend Language', 'Git & GitHub', 'Databases 101', 'A Frontend Framework', 'A Backend Framework', 'REST APIs', 'Authentication', 'Full-Stack Frameworks', 'Deployment', 'Testing Across the Stack', 'CI/CD Basics', 'Cloud Platforms', 'Real-time Features', 'Monorepos'],
  'data-ai': ['Excel/Google Sheets', 'SQL', 'Statistics Basics', 'Python or R', 'Data Visualization', 'Data Cleaning', 'A/B Testing', 'Dashboarding Tools', 'ETL Basics', 'Intro to Machine Learning', 'Big Data Tools', 'Storytelling with Data'],
  devops: ['Linux Basics', 'Networking', 'Git', 'A Scripting Language', 'Docker', 'CI/CD', 'Cloud Fundamentals', 'Infrastructure as Code', 'Kubernetes', 'Monitoring', 'Configuration Management', 'Secrets Management', 'Service Mesh', 'Site Reliability Engineering', 'Multi-Cloud Strategy'],
  cybersecurity: ['Networking Fundamentals', 'Operating Systems', 'Security Basics', 'Network Security', 'Web App Security', 'Cryptography Basics', 'Penetration Testing', 'SIEM Tools', 'Incident Response', 'Cloud Security', 'Malware Analysis', 'Security Certifications'],
  mobile: ['Kotlin or Swift', 'Or: Dart / JavaScript', 'Git & GitHub', 'UI Fundamentals', 'A Framework', 'Local Storage', 'REST APIs', 'State Management', 'Firebase', 'Testing', 'Performance', 'Offline-First Design', 'CI/CD for Mobile', 'App Store Publishing', 'Deep Linking'],
  uiux: ['Design Principles', 'Color & Typography', 'Sketching', 'Figma', 'Wireframing', 'Prototyping', 'User Research', 'Usability Testing', 'Personas & Journey Maps', 'Design Systems', 'Interaction Design', 'Dev Handoff'],
  cloud: ['Cloud Concepts', 'Networking Basics', 'Linux Fundamentals', 'EC2', 'S3', 'VPC', 'IAM', 'Lambda', 'RDS', 'Load Balancing', 'High Availability', 'Cost Optimization', 'AWS Certification'],
};

const STOPWORDS = new Set(['a', 'an', 'the', 'or', 'and', 'for', 'to', 'of', 'in', 'on', 'with', 'your', 'basics', 'fundamentals']);

// Hand-curated overrides for topics the keyword-overlap heuristic can't find
// (either because the primary content dir doesn't cover the concept, the
// best content lives under a different developer-roadmap folder entirely
// -- e.g. React's own roadmap for "State Management" -- or the title is a
// short abbreviation like "S3" that the >=3-char word filter drops). Each
// entry is a list of {slug, file} pairs; when a title has more than one,
// their descriptions are concatenated and their resources merged.
const OVERRIDES = {
  frontend: {
    'Responsive & Accessible UI': [{ slug: 'frontend', file: 'accessibility' }],
    'Build Tools': [{ slug: 'frontend', file: 'module-bundlers' }],
    'TypeScript': [{ slug: 'react', file: 'typescript' }],
    'State Management': [{ slug: 'react', file: 'state-management' }],
    'Routing': [{ slug: 'react', file: 'routers' }],
    'Authentication in the Browser': [{ slug: 'frontend', file: 'auth-strategies' }],
  },
  backend: {
    'Data Structures & Algorithms': [{ slug: 'datastructures-and-algorithms', file: 'basic-data-structures' }],
    'OS & Networking Basics': [{ slug: 'backend', file: 'how-does-the-internet-work' }, { slug: 'backend', file: 'what-is-http' }],
    'REST API Design': [{ slug: 'backend', file: 'rest' }],
    'Containerization': [{ slug: 'devops', file: 'docker' }],
    'System Design': [{ slug: 'system-design', file: 'availability-patterns' }, { slug: 'system-design', file: 'application-caching' }],
  },
  fullstack: {
    'A Backend Language': [{ slug: 'backend', file: 'pick-a-backend-language' }],
    'Databases 101': [{ slug: 'full-stack', file: 'postgresql' }],
    'A Backend Framework': [{ slug: 'full-stack', file: 'nodejs' }],
    'Authentication': [{ slug: 'full-stack', file: 'jwt-auth' }],
    'Full-Stack Frameworks': [{ slug: 'nextjs', file: 'introduction' }],
    'Testing Across the Stack': [{ slug: 'react', file: 'testing' }],
    'CI/CD Basics': [{ slug: 'full-stack', file: 'github-actions' }],
    'Cloud Platforms': [{ slug: 'full-stack', file: 'basic-aws-services' }],
  },
  'data-ai': {
    'Excel/Google Sheets': [{ slug: 'data-analyst', file: 'analysis--reporting-with-excel' }],
    'SQL': [{ slug: 'sql', file: 'basic-sql-syntax' }],
    'Statistics Basics': [{ slug: 'data-analyst', file: 'central-tendency' }, { slug: 'data-analyst', file: 'dispersion' }],
    'Python or R': [{ slug: 'data-analyst', file: 'learn-a-programming-lang' }],
    'Dashboarding Tools': [{ slug: 'data-analyst', file: 'tableau' }, { slug: 'data-analyst', file: 'power-bi' }],
    'ETL Basics': [{ slug: 'data-analyst', file: 'data-transformation' }],
  },
  devops: {
    'CI/CD': [{ slug: 'devops', file: 'ci--cd-tools' }],
    'Multi-Cloud Strategy': [{ slug: 'devops', file: 'cloud-providers' }],
  },
  cybersecurity: {
    'Web App Security': [{ slug: 'cyber-security', file: 'web-based-attacks-and-owasp10' }],
    'Cryptography Basics': [{ slug: 'cyber-security', file: 'hashing' }, { slug: 'cyber-security', file: 'pki' }],
    'Incident Response': [
      { slug: 'cyber-security', file: 'identification' },
      { slug: 'cyber-security', file: 'containment' },
      { slug: 'cyber-security', file: 'eradication' },
      { slug: 'cyber-security', file: 'recovery' },
      { slug: 'cyber-security', file: 'lessons-learned' },
    ],
  },
  mobile: {
    'Or: Dart / JavaScript': [{ slug: 'flutter', file: 'basics-of-dart' }],
    'UI Fundamentals': [{ slug: 'android', file: 'the-fundamentals' }],
    'A Framework': [{ slug: 'react-native', file: 'what-is-react-native' }],
    'REST APIs': [{ slug: 'flutter', file: 'restful-apis' }],
    'State Management': [{ slug: 'android', file: 'viewmodel-state' }, { slug: 'android', file: 'mvvm' }],
    'Performance': [{ slug: 'react-native', file: 'performance' }],
    'Offline-First Design': [{ slug: 'flutter', file: 'storage' }],
    'CI/CD for Mobile': [{ slug: 'flutter', file: 'ci--cd' }],
    'App Store Publishing': [{ slug: 'flutter', file: 'appstore' }, { slug: 'flutter', file: 'playstore' }],
    'Deep Linking': [{ slug: 'react-native', file: 'deeplinking' }],
  },
  uiux: {
    'Color & Typography': [{ slug: 'design-system', file: 'color' }, { slug: 'design-system', file: 'typography' }],
    'Sketching': [{ slug: 'product-design', file: 'sketching' }],
    'Wireframing': [{ slug: 'product-design', file: 'wireframing' }],
    'Personas & Journey Maps': [{ slug: 'ux-design', file: 'create-user-personas' }],
    'Dev Handoff': [{ slug: 'product-design', file: 'design-handoff' }],
  },
  cloud: {
    'Networking Basics': [{ slug: 'cyber-security', file: 'basics-of-computer-networking' }],
    'Linux Fundamentals': [{ slug: 'linux', file: 'basic-commands' }],
    'S3': [{ slug: 'aws', file: 's3' }],
    'High Availability': [{ slug: 'aws', file: 'auto-scaling' }, { slug: 'aws', file: 'elastic-load-balancers' }],
    'Cost Optimization': [{ slug: 'aws', file: 'purchasing-options' }],
  },
};

function words(str) {
  return str
    .toLowerCase()
    .replace(/[()&/]/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

function parseMarkdown(text) {
  const lines = text.split(/\r?\n/);
  let title = '';
  const descLines = [];
  const resources = [];
  let inResources = false;
  for (const line of lines) {
    if (!title && line.startsWith('# ')) { title = line.slice(2).trim(); continue; }
    const resMatch = line.match(/^-\s*\[@([a-z]+)@([^\]]+)\]\(([^)]+)\)/i);
    if (resMatch) {
      inResources = true;
      resources.push({ type: resMatch[1], label: resMatch[2].trim(), url: resMatch[3].trim() });
      continue;
    }
    if (/^visit the following resources/i.test(line.trim())) { inResources = true; continue; }
    if (!inResources && line.trim()) descLines.push(line.trim());
  }
  return { title, description: descLines.join(' ').trim(), resources };
}

function loadContentFiles(slug) {
  if (contentCache.has(slug)) return contentCache.get(slug);
  const dir = path.join(DEV_ROADMAP_ROOT, slug, 'content');
  if (!fs.existsSync(dir)) { contentCache.set(slug, []); return []; }
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const topicSlug = f.split('@')[0];
      const parsed = parseMarkdown(fs.readFileSync(path.join(dir, f), 'utf-8'));
      return { file: f, topicSlug, topicWords: words(topicSlug.replace(/-/g, ' ')), ...parsed };
    });
  contentCache.set(slug, files);
  return files;
}
const contentCache = new Map();

function bestMatch(title, files) {
  const titleWords = words(title);
  if (titleWords.length === 0 || files.length === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const f of files) {
    const overlap = titleWords.filter(w => f.topicWords.includes(w)).length;
    const score = overlap / titleWords.length;
    if (score > bestScore) { bestScore = score; best = f; }
  }
  return bestScore >= 0.5 ? best : null;
}

// Resolve a hand-curated override: {slug, file}[] -> a single merged
// {description, resources, sourceSlug} matching bestMatch()'s output shape.
function resolveOverride(entries) {
  const parts = [];
  const resources = [];
  const seenUrls = new Set();
  const sourceSlugs = [];
  for (const { slug, file } of entries) {
    const found = loadContentFiles(slug).find(f => f.topicSlug === file);
    if (!found) continue;
    if (found.description) parts.push(found.description);
    for (const r of found.resources) {
      if (!seenUrls.has(r.url)) { seenUrls.add(r.url); resources.push(r); }
    }
    sourceSlugs.push(`${slug}/${file}`);
  }
  if (parts.length === 0 && resources.length === 0) return null;
  return { description: parts.join(' '), resources, sourceSlug: sourceSlugs.join(', ') };
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let totalMatched = 0;
let totalTopics = 0;

for (const [roadmapId, topics] of Object.entries(TOPICS_BY_ROADMAP)) {
  const slug = SLUG_MAP[roadmapId];
  const files = loadContentFiles(slug);
  const roadmapOverrides = OVERRIDES[roadmapId] || {};
  const out = {};
  for (const title of topics) {
    totalTopics++;
    const match = roadmapOverrides[title] ? resolveOverride(roadmapOverrides[title]) : bestMatch(title, files);
    if (match) {
      totalMatched++;
      out[title] = { description: match.description, resources: match.resources, sourceSlug: match.sourceSlug ?? match.topicSlug };
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, `${roadmapId}.json`), JSON.stringify(out, null, 2), 'utf-8');
  console.log(`${roadmapId}: matched ${Object.keys(out).length}/${topics.length} topics (source: ${slug})`);
}

console.log(`\nTotal: ${totalMatched}/${totalTopics} topics matched with developer-roadmap content.`);
