'use client';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  Route, Code2, Server, Layers, Cloud, BarChart3, Smartphone,
  ShieldCheck, Palette, CloudCog, ChevronDown, Search, ExternalLink,
  CheckCircle2, Circle, GitBranch, ArrowRight,
} from 'lucide-react';
import { fetchStudentProfile, EMPTY_STUDENT_PROFILE } from '@/lib/userContext';
import { StudentProfile } from '@/lib/types';

type Stage = { name: string; skills: string[] };
type CareerPath = {
  id: string;
  title: string;
  category: 'Development' | 'Data & AI' | 'Cloud & DevOps' | 'Design' | 'Security';
  tagline: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  accent: string;
  // Real roadmap.sh URL for this path — the source of truth for the full,
  // community-maintained, always-up-to-date interactive roadmap. The
  // `stages` below are just a condensed in-app preview of it.
  roadmapUrl: string;
  stages: Stage[];
};

const CATEGORY_COLOR: Record<CareerPath['category'], string> = {
  'Development': 'var(--blue)',
  'Data & AI': 'var(--orange)',
  'Cloud & DevOps': '#4AAA82',
  'Security': '#E06060',
  'Design': 'var(--blue)',
};

const PATHS: CareerPath[] = [
  {
    id: 'frontend',
    title: 'Frontend Development',
    category: 'Development',
    tagline: 'Turn designs into fast, accessible interfaces people actually enjoy using.',
    icon: Code2,
    accent: CATEGORY_COLOR['Development'],
    roadmapUrl: 'https://roadmap.sh/frontend',
    stages: [
      { name: 'Foundation', skills: ['HTML', 'CSS', 'JavaScript', 'Git'] },
      { name: 'Core Skills', skills: ['Responsive Design', 'DOM & Events', 'REST APIs', 'Accessibility'] },
      { name: 'Framework', skills: ['React', 'State Management', 'TypeScript', 'React Router'] },
      { name: 'Advanced', skills: ['Testing', 'Performance Optimization', 'Build Tools', 'Next.js'] },
      { name: 'Job-Ready', skills: ['Portfolio Projects', 'Deployment', 'Interview Prep'] },
    ],
  },
  {
    id: 'backend',
    title: 'Backend Development',
    category: 'Development',
    tagline: 'Build the APIs, databases, and logic that power real products.',
    icon: Server,
    accent: CATEGORY_COLOR['Development'],
    roadmapUrl: 'https://roadmap.sh/backend',
    stages: [
      { name: 'Foundation', skills: ['Python', 'SQL', 'Git', 'Linux Basics'] },
      { name: 'Core Skills', skills: ['REST APIs', 'Authentication', 'Databases', 'ORMs'] },
      { name: 'Framework', skills: ['FastAPI', 'Django', 'Node.js', 'Testing'] },
      { name: 'Advanced', skills: ['Redis', 'Message Queues', 'Microservices', 'Docker'] },
      { name: 'Job-Ready', skills: ['System Design Basics', 'Deployment', 'Interview Prep'] },
    ],
  },
  {
    id: 'fullstack',
    title: 'Full Stack Development',
    category: 'Development',
    tagline: 'Own the entire product, from the database to the browser.',
    icon: Layers,
    accent: CATEGORY_COLOR['Development'],
    roadmapUrl: 'https://roadmap.sh/full-stack',
    stages: [
      { name: 'Foundation', skills: ['HTML', 'CSS', 'JavaScript', 'Git'] },
      { name: 'Frontend Layer', skills: ['React', 'State Management', 'TypeScript'] },
      { name: 'Backend Layer', skills: ['Node.js', 'REST APIs', 'SQL'] },
      { name: 'Integration', skills: ['Authentication', 'CI/CD', 'Docker'] },
      { name: 'Job-Ready', skills: ['Full Project Build', 'System Design', 'Interview Prep'] },
    ],
  },
  {
    id: 'devops',
    title: 'DevOps Engineering',
    category: 'Cloud & DevOps',
    tagline: 'Automate, deploy, and keep systems running reliably at scale.',
    icon: Cloud,
    accent: CATEGORY_COLOR['Cloud & DevOps'],
    roadmapUrl: 'https://roadmap.sh/devops',
    stages: [
      { name: 'Foundation', skills: ['Linux', 'Networking', 'Git'] },
      { name: 'Core Skills', skills: ['Shell Scripting', 'CI/CD', 'Docker'] },
      { name: 'Tools', skills: ['Kubernetes', 'Terraform', 'AWS'] },
      { name: 'Advanced', skills: ['Monitoring & Logging', 'Infrastructure as Code', 'Security Basics'] },
      { name: 'Job-Ready', skills: ['Real Projects', 'Certifications', 'Interview Prep'] },
    ],
  },
  {
    id: 'data-ai',
    title: 'Data Science & AI',
    category: 'Data & AI',
    tagline: 'Turn raw data into predictions, insights, and intelligent products.',
    icon: BarChart3,
    accent: CATEGORY_COLOR['Data & AI'],
    roadmapUrl: 'https://roadmap.sh/ai-data-scientist',
    stages: [
      { name: 'Foundation', skills: ['Python', 'Statistics', 'Linear Algebra'] },
      { name: 'Core Skills', skills: ['Pandas', 'NumPy', 'SQL', 'Data Visualization'] },
      { name: 'Machine Learning', skills: ['Scikit-learn', 'Model Evaluation', 'Feature Engineering'] },
      { name: 'Advanced', skills: ['Deep Learning', 'NLP', 'MLOps'] },
      { name: 'Job-Ready', skills: ['Kaggle Projects', 'Portfolio', 'Interview Prep'] },
    ],
  },
  {
    id: 'mobile',
    title: 'Mobile App Development',
    category: 'Development',
    tagline: 'Ship apps that people carry in their pocket every day.',
    icon: Smartphone,
    accent: CATEGORY_COLOR['Development'],
    roadmapUrl: 'https://roadmap.sh/android',
    stages: [
      { name: 'Foundation', skills: ['Kotlin', 'UI Basics', 'Git'] },
      { name: 'Core Skills', skills: ['Layouts', 'Navigation', 'Local Storage'] },
      { name: 'Integration', skills: ['REST APIs', 'Firebase', 'State Management'] },
      { name: 'Advanced', skills: ['Push Notifications', 'Performance', 'Testing'] },
      { name: 'Job-Ready', skills: ['Publish an App', 'Play Store Launch', 'Interview Prep'] },
    ],
  },
  {
    id: 'cybersecurity',
    title: 'Cybersecurity',
    category: 'Security',
    tagline: 'Defend systems, hunt threats, and stay one step ahead of attackers.',
    icon: ShieldCheck,
    accent: CATEGORY_COLOR['Security'],
    roadmapUrl: 'https://roadmap.sh/cyber-security',
    stages: [
      { name: 'Foundation', skills: ['Networking', 'Operating Systems', 'Linux'] },
      { name: 'Core Skills', skills: ['Security Fundamentals', 'Cryptography', 'Risk Assessment'] },
      { name: 'Tools', skills: ['Penetration Testing', 'Wireshark', 'SIEM Tools'] },
      { name: 'Advanced', skills: ['Threat Hunting', 'Cloud Security', 'Incident Response'] },
      { name: 'Job-Ready', skills: ['CTF Practice', 'Certifications', 'Interview Prep'] },
    ],
  },
  {
    id: 'uiux',
    title: 'UI/UX Design',
    category: 'Design',
    tagline: 'Design experiences that feel obvious in hindsight.',
    icon: Palette,
    accent: CATEGORY_COLOR['Design'],
    roadmapUrl: 'https://roadmap.sh/ux-design',
    stages: [
      { name: 'Foundation', skills: ['Design Principles', 'Color & Typography', 'Sketching'] },
      { name: 'Core Skills', skills: ['Figma', 'Wireframing', 'Prototyping'] },
      { name: 'Research', skills: ['User Research', 'Usability Testing', 'Personas'] },
      { name: 'Advanced', skills: ['Design Systems', 'Interaction Design', 'Dev Handoff'] },
      { name: 'Job-Ready', skills: ['Case Studies', 'Portfolio', 'Interview Prep'] },
    ],
  },
  {
    id: 'cloud',
    title: 'Cloud Computing (AWS)',
    category: 'Cloud & DevOps',
    tagline: 'Design and run infrastructure that scales on demand.',
    icon: CloudCog,
    accent: CATEGORY_COLOR['Cloud & DevOps'],
    roadmapUrl: 'https://roadmap.sh/aws',
    stages: [
      { name: 'Foundation', skills: ['Cloud Concepts', 'Networking', 'Linux'] },
      { name: 'Core Skills', skills: ['EC2', 'S3', 'VPC', 'IAM'] },
      { name: 'Advanced', skills: ['Lambda', 'RDS', 'Load Balancing'] },
      { name: 'Architecture', skills: ['High Availability', 'Cost Optimization', 'Security'] },
      { name: 'Job-Ready', skills: ['AWS Certification', 'Real Projects', 'Interview Prep'] },
    ],
  },
];

const CATEGORIES: Array<CareerPath['category'] | 'All'> = ['All', 'Development', 'Data & AI', 'Cloud & DevOps', 'Design', 'Security'];

export default function CareerPathPage() {
  const [student, setStudent] = useState<StudentProfile>(EMPTY_STUDENT_PROFILE);
  const [category, setCategory] = useState<CareerPath['category'] | 'All'>('All');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const load = () => { fetchStudentProfile().then(setStudent); };
    load();
    window.addEventListener('nexyuva_profile_updated', load);
    return () => window.removeEventListener('nexyuva_profile_updated', load);
  }, []);

  const mySkills = useMemo(() => new Set(student.skills.map(s => s.toLowerCase())), [student.skills]);

  const filtered = useMemo(() => {
    let list = [...PATHS];
    if (category !== 'All') list = list.filter(p => p.category === category);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.stages.some(s => s.skills.some(sk => sk.toLowerCase().includes(q)))
      );
    }
    return list;
  }, [category, query]);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>
          <Route size={28} color="var(--accent-amber)" style={{ marginRight: 10, verticalAlign: 'middle' }} />
          Career Guidance
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Step-by-step roadmaps for {PATHS.length} in-demand tech careers, powered by{' '}
          <a href="https://roadmap.sh" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)' }}>roadmap.sh</a>
          {' '}— pick a path, see exactly what to learn next, then jump into the full interactive roadmap.
        </p>
      </div>

      {/* Search + Category Filters */}
      <div className="glass-card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input-field"
            placeholder="Search a role or skill — e.g. React, AWS, penetration testing..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={category === c ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '7px 16px', fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Path Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 18 }}>
        {filtered.map(path => (
          <PathCard
            key={path.id}
            path={path}
            mySkills={mySkills}
            isExpanded={expanded === path.id}
            onToggle={() => setExpanded(expanded === path.id ? null : path.id)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="glass-card" style={{ padding: 48, textAlign: 'center', gridColumn: '1 / -1' }}>
            <Search size={40} color="var(--text-muted)" style={{ marginBottom: 16 }} />
            <h3 style={{ marginBottom: 8 }}>No paths found</h3>
            <p style={{ color: 'var(--text-secondary)' }}>Try a different search term or category.</p>
          </div>
        )}
      </div>

      {/* Credit / further reading */}
      <div className="glass-card" style={{ padding: 20, marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Want the full depth version of any path?</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Hit &ldquo;Full Roadmap&rdquo; on any card for the complete in-app stage-by-stage path, with a Beginner and Deep Dive view. These previews are just a starting point.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <a href="https://roadmap.sh" target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: 12 }}>
            <ExternalLink size={14} /> roadmap.sh
          </a>
          <a href="https://github.com/kamranahmedse/developer-roadmap" target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: 12 }}>
            <GitBranch size={14} /> GitHub Source
          </a>
        </div>
      </div>
    </div>
  );
}

function PathCard({ path, mySkills, isExpanded, onToggle }: {
  path: CareerPath;
  mySkills: Set<string>;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const Icon = path.icon;
  const allSkills = path.stages.flatMap(s => s.skills);
  const matchedCount = allSkills.filter(s => mySkills.has(s.toLowerCase())).length;
  const pct = Math.round((matchedCount / allSkills.length) * 100);

  return (
    <div className="glass-card" style={{ padding: 20, gridColumn: isExpanded ? '1 / -1' : undefined }}>
      {/* Card header */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{
          width: 44, height: 44, flexShrink: 0,
          background: `${path.accent}14`, border: `1px solid ${path.accent}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={20} color={path.accent} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{path.title}</h3>
            <span className="badge" style={{ color: path.accent, borderColor: `${path.accent}35`, background: `${path.accent}12`, flexShrink: 0 }}>
              {path.category}
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.5 }}>{path.tagline}</p>
        </div>
      </div>

      {/* Skill match */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
          <span>YOUR SKILLS COVER</span>
          <span style={{ color: pct > 0 ? '#4AAA82' : 'var(--text-muted)', fontWeight: 700 }}>{matchedCount}/{allSkills.length} · {pct}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%`, background: pct > 0 ? '#4AAA82' : '#D8D8D5' }} />
        </div>
      </div>

      {/* Actions: in-app preview toggle + real roadmap.sh link */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={onToggle}
          className="btn-secondary"
          style={{ flex: 1, justifyContent: 'center', fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
        >
          {isExpanded ? 'Hide Preview' : 'Quick Preview'}
          <ChevronDown size={14} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        <Link
          href={`/student/career-path/${path.id}/roadmap`}
          className="btn-primary"
          style={{ flex: 1, justifyContent: 'center', fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
        >
          Full Roadmap <ArrowRight size={13} />
        </Link>
      </div>

      {/* Expanded stepper */}
      {isExpanded && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 0 }}>
            {path.stages.map((stage, i) => (
              <div key={stage.name} style={{ position: 'relative', paddingLeft: 20, paddingBottom: 20 }}>
                {/* connector line */}
                {i < path.stages.length - 1 && (
                  <div style={{
                    position: 'absolute', left: 5, top: 18, bottom: -6, width: 1,
                    background: 'var(--glass-border)', display: window?.innerWidth < 900 ? 'block' : 'none',
                  }} />
                )}
                <div style={{ position: 'absolute', left: 0, top: 3, width: 11, height: 11, background: path.accent }} />
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: path.accent, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Stage {i + 1} · {stage.name}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {stage.skills.map(skill => {
                    const has = mySkills.has(skill.toLowerCase());
                    return (
                      <span key={skill} className={`tag ${has ? 'matched' : ''}`} style={{ fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {has ? <CheckCircle2 size={10} /> : <Circle size={10} />}
                        {skill}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
