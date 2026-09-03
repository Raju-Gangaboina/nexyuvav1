'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft, Code2, Server, Layers, Cloud, BarChart3, Smartphone,
  ShieldCheck, Palette, CloudCog, Sparkles, GraduationCap,
  Globe, Braces, Paintbrush, FileJson2, GitBranch, MonitorSmartphone,
  Package, Hammer, ShieldHalf, Database, KeyRound, Gauge, Boxes, Radio,
  Bug, Network, Workflow, Lock, TestTube2, GitCommitHorizontal, Cpu, Terminal,
  LayoutGrid, PenTool, Frame, Component, Users, Rocket, LineChart,
  Brain, Table2, Container, GitPullRequestArrow,
  ScanLine, Fingerprint, Wifi, Bell, ClipboardList, BookOpen,
} from 'lucide-react';
import { ROADMAPS } from '@/lib/roadmaps';
import { fetchStudentProfile, EMPTY_STUDENT_PROFILE } from '@/lib/userContext';
import { StudentProfile } from '@/lib/types';
import FrontendDeepDive from './FrontendDeepDive';
import NodePanel, { NodePanelTopic } from '@/components/roadmap/NodePanel';
import RoadmapCanvas from '@/components/roadmap/RoadmapCanvas';

const PATH_ICON: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  frontend: Code2, backend: Server, fullstack: Layers, devops: Cloud,
  'data-ai': BarChart3, mobile: Smartphone, cybersecurity: ShieldCheck,
  uiux: Palette, cloud: CloudCog,
};
const PATH_ACCENT: Record<string, string> = {
  frontend: 'var(--blue)', backend: 'var(--blue)', fullstack: 'var(--blue)',
  devops: '#4AAA82', 'data-ai': 'var(--orange)', mobile: 'var(--blue)',
  cybersecurity: '#E06060', uiux: 'var(--blue)', cloud: '#4AAA82',
};

// Per-topic icon + colour, matched by keyword against the topic title.
// Falls back to a generic book icon in the stage's accent colour.
type IconType = React.ComponentType<{ size?: number; color?: string }>;
const TOPIC_ICON_RULES: [RegExp, IconType, string][] = [
  [/web works|http|dns|networking|tcp/i, Globe, '#2B7FD4'],
  [/html/i, Code2, '#E8820A'],
  [/css(?!\s*frameworks)/i, Paintbrush, '#9B5DE5'],
  [/javascript|^js$/i, FileJson2, '#F0C419'],
  [/typescript/i, Braces, '#3E7FC1'],
  [/git\s?&?\s?github|version control/i, GitBranch, '#4AAA82'],
  [/github/i, GitCommitHorizontal, '#C9C9C9'],
  [/framework|react|vue|svelte|angular/i, Component, '#2B7FD4'],
  [/package manager|npm|yarn|pnpm/i, Package, '#E8820A'],
  [/build tools|vite|webpack|turbopack/i, Hammer, '#4AAA82'],
  [/css frameworks|tailwind|styled-components/i, LayoutGrid, '#38BDF8'],
  [/responsive|accessible ui|a11y|accessibility/i, MonitorSmartphone, '#2B7FD4'],
  [/state management|redux|zustand|pinia/i, Boxes, '#9B5DE5'],
  [/routing/i, Workflow, '#4AAA82'],
  [/testing|jest|vitest|playwright/i, TestTube2, '#E06060'],
  [/devtools|debugging|profiling/i, Bug, '#F0C419'],
  [/api/i, Network, '#2B7FD4'],
  [/performance|caching|web vitals/i, Gauge, '#E8820A'],
  [/security|xss|csrf|cors/i, ShieldHalf, '#E06060'],
  [/auth/i, KeyRound, '#F0C419'],
  [/graphql/i, Radio, '#D946A0'],
  [/ssr|ssg|next\.js|nuxt|remix/i, Rocket, '#2B7FD4'],
  [/pwa|service worker/i, Wifi, '#4AAA82'],
  [/design system|storybook/i, Component, '#9B5DE5'],
  [/ci\/cd|deployment|vercel|netlify/i, GitPullRequestArrow, '#4AAA82'],
  [/portfolio|interview/i, ClipboardList, '#E8820A'],
  [/language|python|node\.js|java\b|golang|^go$/i, Terminal, '#2B7FD4'],
  [/data structures|algorithms/i, Cpu, '#9B5DE5'],
  [/os &|operating system/i, Server, '#4AAA82'],
  [/relational database|postgres|mysql|sql/i, Database, '#2B7FD4'],
  [/orm|prisma|hibernate|sqlalchemy/i, Boxes, '#E8820A'],
  [/message queue|kafka|rabbitmq/i, Radio, '#D946A0'],
  [/nosql|mongodb|dynamodb/i, Database, '#4AAA82'],
  [/container|docker/i, Container, '#38BDF8'],
  [/microservices/i, Boxes, '#2B7FD4'],
  [/system design|scalability|load balanc/i, Network, '#9B5DE5'],
  [/observability|logging|metrics|tracing/i, ScanLine, '#F0C419'],
  [/figma|ui design|wireframe/i, Frame, '#E06060'],
  [/prototyp/i, PenTool, '#9B5DE5'],
  [/user research|usability/i, Users, '#2B7FD4'],
  [/design tokens|color theory/i, Palette, '#E8820A'],
  [/data visualization|charts/i, LineChart, '#4AAA82'],
  [/machine learning|ai\b|model/i, Brain, '#D946A0'],
  [/pandas|numpy|dataframe/i, Table2, '#2B7FD4'],
  [/cloud|aws|azure|gcp/i, Cloud, '#38BDF8'],
  [/kubernetes|k8s|orchestration/i, Boxes, '#2B7FD4'],
  [/monitoring|alert/i, Bell, '#F0C419'],
  [/encryption|cryptograph/i, Lock, '#E06060'],
  [/penetration|pentest|vulnerabilit/i, Fingerprint, '#E06060'],
  [/mobile|android|ios|flutter|swift|kotlin/i, Smartphone, '#2B7FD4'],
  [/server\b/i, Server, '#4AAA82'],
];
function getTopicIcon(title: string): [IconType, string] {
  const hit = TOPIC_ICON_RULES.find(([re]) => re.test(title));
  return hit ? [hit[1], hit[2]] : [BookOpen, 'var(--text-muted)'];
}

// A roadmap's "Beginner Path" is its Foundations + Core Skills stages only.
// "Deep Dive" is the full thing, including Intermediate and Advanced/Specialization.
const BEGINNER_STAGES = new Set(['Foundations', 'Core Skills']);
const OPTIONAL_STAGE = 'Specialization';
const BRANCH_ACCENT = '#E8820A'; // amber — used for optional/specialization branches only

export default function RoadmapPage() {
  const { id } = useParams<{ id: string }>();
  const roadmap = useMemo(() => ROADMAPS.find(r => r.id === id), [id]);
  const [depth, setDepth] = useState<'beginner' | 'deep'>('beginner');
  const [student, setStudent] = useState<StudentProfile>(EMPTY_STUDENT_PROFILE);
  const [selectedTopic, setSelectedTopic] = useState<NodePanelTopic | null>(null);

  useEffect(() => {
    fetchStudentProfile().then(setStudent);
  }, []);

  const mySkills = useMemo(() => student.skills.map(s => s.toLowerCase()), [student.skills]);
  const isCovered = (title: string) => {
    const t = title.toLowerCase();
    return mySkills.some(s => t.includes(s) || s.includes(t));
  };

  if (!roadmap) {
    return (
      <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8 }}>Roadmap not found</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
          This career path doesn&apos;t have a roadmap yet.
        </p>
        <Link href="/student/career-path" className="btn-primary" style={{ display: 'inline-flex' }}>
          <ArrowLeft size={14} /> Back to Career Guidance
        </Link>
      </div>
    );
  }

  const Icon = PATH_ICON[roadmap.id] ?? Code2;
  const accent = PATH_ACCENT[roadmap.id] ?? 'var(--blue)';
  const stages = depth === 'beginner'
    ? roadmap.stages.filter(s => BEGINNER_STAGES.has(s.stage))
    : roadmap.stages;

  const allTopics = stages.flatMap(s => s.topics);
  const coveredCount = allTopics.filter(t => isCovered(t.title)).length;
  const pct = allTopics.length ? Math.round((coveredCount / allTopics.length) * 100) : 0;
  const hasOptionalStage = stages.some(s => s.stage === OPTIONAL_STAGE);

  return (
    <div>
      <Link href="/student/career-path" className="btn-ghost" style={{ marginBottom: 16, paddingLeft: 0, display: 'inline-flex' }}>
        <ArrowLeft size={14} /> Back to Career Guidance
      </Link>

      {/* Header */}
      <div className="glass-card" style={{ padding: 28, marginBottom: 20, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{
          width: 56, height: 56, flexShrink: 0,
          background: `${accent}14`, border: `1px solid ${accent}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={26} color={accent} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>{roadmap.title}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13.5 }}>{roadmap.blurb}</p>
        </div>
        {/* Match stamp */}
        <div style={{
          width: 76, height: 76, flexShrink: 0, border: `2px solid ${accent}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          transform: 'rotate(-4deg)', boxShadow: `3px 3px 0 ${accent}30`,
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: accent, lineHeight: 1 }}>{pct}%</div>
          <div style={{ fontSize: 8, fontFamily: 'var(--font-mono)', color: accent, letterSpacing: '0.05em', marginTop: 2 }}>COVERED</div>
        </div>
      </div>

      {/* Depth toggle */}
      <div className="glass-card" style={{ padding: 14, marginBottom: 8, display: 'flex', gap: 8 }}>
        <button
          onClick={() => setDepth('beginner')}
          className={depth === 'beginner' ? 'btn-primary' : 'btn-secondary'}
          style={{ flex: 1, justifyContent: 'center', fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
        >
          <GraduationCap size={14} /> Beginner Path
        </button>
        <button
          onClick={() => setDepth('deep')}
          className={depth === 'deep' ? 'btn-primary' : 'btn-secondary'}
          style={{ flex: 1, justifyContent: 'center', fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
        >
          <Sparkles size={14} /> Deep Dive
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
        {depth === 'beginner'
          ? "The essentials to get job-ready. Start here if you're new to this path."
          : 'The full path — foundations through intermediate and advanced specialization.'}
      </p>

      {/* Legend */}
      {hasOptionalStage && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 28, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 18, height: 2, background: accent, display: 'inline-block' }} /> CORE PATH
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 18, height: 0, borderTop: `2px dashed ${BRANCH_ACCENT}`, display: 'inline-block' }} /> SPECIALIZATION (OPTIONAL)
          </span>
        </div>
      )}

      {/* roadmap.sh-style node graph, real SVG connectors */}
      {roadmap.id === 'frontend' && depth === 'deep' ? (
        <FrontendDeepDive onNodeClick={(label) => setSelectedTopic({ title: label, note: '' })} />
      ) : (
        <RoadmapCanvas
          stages={stages}
          accent={accent}
          branchAccent={BRANCH_ACCENT}
          optionalStageName={OPTIONAL_STAGE}
          roadmapId={roadmap.id}
          getTopicIcon={getTopicIcon}
          isCovered={isCovered}
          onNodeClick={setSelectedTopic}
        />
      )}

      <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: -8 }}>
        Roadmap layout inspired by the community learning-path model popularized by{' '}
        <a href="https://roadmap.sh" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)' }}>roadmap.sh</a>.
      </p>

      {selectedTopic && (
        <NodePanel topic={selectedTopic} accent={accent} roadmapId={roadmap.id} onClose={() => setSelectedTopic(null)} />
      )}
    </div>
  );
}
