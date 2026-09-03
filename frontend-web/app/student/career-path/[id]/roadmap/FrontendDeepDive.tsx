'use client';
import React from 'react';
// Hard-coded, literal recreation of the roadmap.sh "Frontend Developer" deep-dive
// diagram (community roadmap.sh layout/wording) for the Deep Dive tab.

type Status = 'todo' | 'learning' | 'done' | 'skip';

// Fired with the node's label text when a Main/Blue trunk node is clicked.
// Provided by the parent page so every node opens the shared learning panel
// without threading an onClick prop through ~150 individual call-sites.
const NodeClickContext = React.createContext<(label: string) => void>(() => {});

const STATUS_STYLE: Record<Status, { bg: string; text: string; strike: boolean }> = {
  todo: { bg: '#F5E642', text: '#1a1a1a', strike: false },
  learning: { bg: '#E9DEFB', text: '#1a1a1a', strike: false },
  done: { bg: '#4A5D5A', text: '#ffffff', strike: true },
  skip: { bg: '#8a8a8a', text: '#ffffff', strike: true },
};

function StatusToolbar({ status, onChange }: { status: Status; onChange: (s: Status) => void }) {
  const items: { key: Status; label: string; icon: string; activeBg: string; activeText: string }[] = [
    { key: 'learning', label: 'Learning', icon: '📖', activeBg: '#7C3AED', activeText: '#fff' },
    { key: 'done', label: 'Done', icon: '✓', activeBg: '#1DA153', activeText: '#fff' },
    { key: 'skip', label: 'Skip', icon: '✕', activeBg: '#3a3a3a', activeText: '#fff' },
  ];
  return (
    <div
      style={{
        position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
        marginBottom: 6, display: 'flex', background: '#fff', border: '1.5px solid #1a1a1a',
        borderRadius: 0, overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.25)', zIndex: 5,
      }}
    >
      {items.map((it, idx) => {
        const active = status === it.key;
        return (
          <div
            key={it.key}
            onClick={(e) => { e.stopPropagation(); onChange(active ? 'todo' : it.key); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
              fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer',
              background: active ? it.activeBg : '#fff',
              color: active ? it.activeText : '#333',
              borderLeft: idx === 0 ? 'none' : '1px solid #ddd',
            }}
          >
            <span>{it.icon}</span>{it.label}
          </div>
        );
      })}
    </div>
  );
}

function StatusNode({ children, base }: { children: React.ReactNode; base: 'yellow' | 'blue' }) {
  const [status, setStatus] = React.useState<Status>('todo');
  const [hover, setHover] = React.useState(false);
  const onNodeClick = React.useContext(NodeClickContext);
  const style = STATUS_STYLE[status];
  const bg = status === 'todo' && base === 'blue' ? '#3455DB' : style.bg;
  const textColor = status === 'todo' && base === 'blue' ? '#fff' : style.text;
  const label = typeof children === 'string' ? children : undefined;
  return (
    <div
      className="roadmap-node"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', display: 'inline-flex', width: '100%' }}
    >
      {hover && <StatusToolbar status={status} onChange={setStatus} />}
      <div
        onClick={() => { if (label) onNodeClick(label); }}
        style={{
          background: bg, color: textColor, fontWeight: 700, fontSize: 13,
          border: '1.5px solid #1a1a1a', borderRadius: 0, padding: '8px 14px',
          textAlign: 'center', whiteSpace: 'nowrap', cursor: 'pointer', width: '100%',
          textDecoration: style.strike ? 'line-through' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          transition: 'background 0.15s',
        }}
      >
        {children}
        {status === 'done' && <span style={{ fontSize: 11 }}>✓</span>}
      </div>
    </div>
  );
}
function Main({ children }: { children: React.ReactNode }) {
  return <StatusNode base="yellow">{children}</StatusNode>;
}
function Blue({ children }: { children: React.ReactNode }) {
  return <StatusNode base="blue">{children}</StatusNode>;
}
function Opt({ children, dot = 'purple' }: { children: React.ReactNode; dot?: 'purple' | 'green' | 'gray' | 'none' }) {
  const dotColor = dot === 'purple' ? '#9B5DE5' : dot === 'green' ? '#4AAA82' : dot === 'gray' ? '#9a9a9a' : 'transparent';
  return (
    <div style={{
      background: '#F5DEB3', color: '#1a1a1a', fontSize: 12, fontWeight: 500,
      border: '1px solid #b8a066', borderRadius: 5, padding: '6px 10px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      whiteSpace: 'nowrap',
    }}>
      <span>{children}</span>
      {dot !== 'none' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />}
    </div>
  );
}
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--void-up)', border: '1px solid var(--glass-border)', borderRadius: 0, padding: '10px 14px', fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
      {children}
    </div>
  );
}
function GrayBtn({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#3a3a3a', color: '#eee', fontSize: 11, fontWeight: 700, borderRadius: 5, padding: '7px 12px', textAlign: 'center' }}>
      {children}
    </div>
  );
}
function Col({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>;
}
function isEmptySlot(el: React.ReactNode): boolean {
  return React.isValidElement(el) && el.type === 'div' && !(el.props as { children?: React.ReactNode }).children;
}
function isMainPath(el: React.ReactNode): boolean {
  return React.isValidElement(el) && (el.type === Main || el.type === Blue);
}
function itemCount(el: React.ReactNode): number {
  if (isEmptySlot(el)) return 0;
  if (React.isValidElement(el) && el.type === Col) {
    return React.Children.count((el.props as { children?: React.ReactNode }).children);
  }
  return 1;
}

// Curved, fanned-out dotted/solid connector drawn as an SVG overlay in the
// 22px gap column. Anchors on the trunk side and fans out to each stacked
// item on the far side (evenly spaced), matching the roadmap.sh look.
function Connector({ filled, solid, count, side }: { filled: boolean; solid: boolean; count: number; side: 'left' | 'right' }) {
  if (!filled) return <div />;
  const n = Math.max(count, 1);
  const trunkX = side === 'left' ? 22 : 0;
  const farX = side === 'left' ? 0 : 22;
  const midX = 11;
  const paths: string[] = [];
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 50 : ((i + 0.5) / n) * 100;
    paths.push(`M${trunkX},50 C${midX},50 ${midX},${y} ${farX},${y}`);
  }
  return (
    <svg
      viewBox="0 0 22 100"
      preserveAspectRatio="none"
      style={{ width: 22, height: '100%', minHeight: 30, display: 'block', opacity: 0.65 }}
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="#2B7FD4"
          strokeWidth={2}
          strokeDasharray={solid ? undefined : '2 4'}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  const left = items[0];
  const center = items[1];
  const right = items[2];
  const leftFilled = !isEmptySlot(left);
  const rightFilled = !isEmptySlot(right);
  const leftSolid = isMainPath(left);
  const rightSolid = isMainPath(right);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 22px 1fr 22px 1fr', alignItems: 'center', marginBottom: 20, position: 'relative', zIndex: 1 }}>
      <div>{left}</div>
      <Connector filled={leftFilled} solid={leftSolid} count={itemCount(left)} side="left" />
      <div>{center}</div>
      <Connector filled={rightFilled} solid={rightSolid} count={itemCount(right)} side="right" />
      <div>{right}</div>
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', alignSelf: 'center' }}>{children}</div>;
}

export default function FrontendDeepDive({ onNodeClick }: { onNodeClick?: (label: string) => void }) {
  return (
    <NodeClickContext.Provider value={onNodeClick ?? (() => {})}>
    <div style={{ maxWidth: 980, margin: '0 auto', paddingBottom: 40, fontFamily: 'Inter' }}>
      {/* top intro cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 24 }}>
        <Col>
          <Note>
            🟣 Personal Recommendation<br />🟢 Alternative Option<br />⚪ Order not strict on roadmap
          </Note>
          <GrayBtn>Visit Beginner Friendly Version</GrayBtn>
          <Note>
            <strong>Related Roadmaps</strong><br />✓ JavaScript Roadmap<br />✓ React Roadmap<br />✓ TypeScript Roadmap<br />✓ Node.js Roadmap
          </Note>
        </Col>
        <div />
        <Note>Find the detailed version of this roadmap along with other similar roadmaps — <strong>roadmap.sh</strong></Note>
      </div>

      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 18, marginBottom: 6 }}>Front-end</div>
      <p style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 14 }}>
        Hover any yellow/blue node for Learning / Done / Skip controls
      </p>

      <div style={{ position: 'relative' }}>
        {/* central vertical trunk line running through the whole chain */}
        <div style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0, width: 3,
          background: '#2B7FD4', opacity: 0.35, transform: 'translateX(-50%)', zIndex: 0,
        }} />

      <Row>
        <div />
        <Main>Internet</Main>
        <Col>
          <Opt dot="green">How does the internet work?</Opt>
          <Opt dot="green">What is HTTP?</Opt>
          <Opt dot="green">What is Domain Name?</Opt>
          <Opt dot="green">What is hosting?</Opt>
          <Opt dot="green">DNS and how it works?</Opt>
          <Opt dot="green">Browsers and how they work?</Opt>
        </Col>
      </Row>

      <Row>
        <div /><Main>HTML</Main><div />
      </Row>
      <Row>
        <div /><Main>CSS</Main><div />
      </Row>
      <Row>
        <div /><Main>JavaScript</Main><div />
      </Row>

      <Row>
        <Col><Opt dot="green">Git</Opt></Col>
        <Main>Version Control</Main>
        <div />
      </Row>
      <Row>
        <Col>
          <Opt dot="green">GitLab</Opt>
          <Opt dot="green">GitHub</Opt>
        </Col>
        <Main>VCS Hosting</Main>
        <Main>Package Managers</Main>
      </Row>
      <Row>
        <div />
        <Col>
          <Note>At this point, you should be able to build modern vanilla JS frontend applications.</Note>
          <GrayBtn>Intermediate Project Ideas</GrayBtn>
        </Col>
        <Col>
          <Opt dot="purple">npm</Opt>
          <Opt dot="purple">yarn</Opt>
          <Opt dot="green">pnpm</Opt>
          <Opt dot="purple">Bun</Opt>
        </Col>
      </Row>
      <Row>
        <div /><div />
        <Main>CSS Frameworks</Main>
      </Row>
      <Row>
        <div /><div />
        <Opt dot="purple">Tailwind</Opt>
      </Row>

      <Row>
        <Col>
          <Opt dot="green">React</Opt>
          <Opt dot="green">Vue.js</Opt>
          <Opt dot="green">Angular</Opt>
          <Opt dot="green">Svelte</Opt>
          <Opt dot="green">Solid JS</Opt>
        </Col>
        <Main>Learn a Framework</Main>
        <Label>AI in Development</Label>
      </Row>

      <Row>
        <Col>
          <Opt dot="green">Claude Code</Opt>
          <Opt dot="green">Cursor</Opt>
          <Opt dot="green">Copilot</Opt>
          <Opt dot="green">Antigravity</Opt>
        </Col>
        <Main>AI Assisted Coding</Main>
        <Main>Learn the Basics</Main>
      </Row>
      <Row>
        <div /><div />
        <Col>
          <Opt dot="none">How LLMs work</Opt>
          <Opt dot="none">AI vs Traditional Coding</Opt>
          <Opt dot="none">Applications</Opt>
        </Col>
      </Row>

      <Row>
        <Blue>Prompt Engineering</Blue>
        <Main>Prompting Techniques</Main>
        <div />
      </Row>
      <Row>
        <Blue>AI Agents Roadmap</Blue>
        <Main>Agents</Main>
        <div />
      </Row>
      <Row>
        <div />
        <Main>MCP</Main>
        <div />
      </Row>
      <Row>
        <div />
        <Main>Skills</Main>
        <Col>
          <Opt dot="none">Code Reviews</Opt>
          <Opt dot="none">Refactoring</Opt>
          <Opt dot="none">Docs Generation</Opt>
        </Col>
      </Row>
      <Row>
        <Col>
          <Opt dot="none">Gemini</Opt>
          <Opt dot="none">OpenAI</Opt>
          <Opt dot="none">Anthropic</Opt>
        </Col>
        <Main>Implementing AI</Main>
        <Label>Advanced Frontend</Label>
      </Row>

      <Row>
        <Main>Auth Strategies</Main>
        <Main>Module Bundlers</Main>
        <Main>Linters &amp; Formatters</Main>
      </Row>
      <Row>
        <div />
        <Col>
          <Opt dot="green">Vite</Opt>
          <Opt dot="green">SWC</Opt>
          <Opt dot="green">Rollup</Opt>
          <Opt dot="green">Parcel</Opt>
          <Opt dot="gray">esbuild</Opt>
          <Opt dot="gray">Rolldown</Opt>
        </Col>
        <Col>
          <Opt dot="green">Biome</Opt>
          <Opt dot="green">Prettier</Opt>
          <Opt dot="green">ESLint</Opt>
        </Col>
      </Row>

      <Row>
        <Main>Testing</Main>
        <Col>
          <Note>At this point you should have the expertise of an intermediate level frontend developer. Keep practicing and sharpening your skills.</Note>
          <GrayBtn>Advanced Project Ideas</GrayBtn>
        </Col>
        <div />
      </Row>
      <Row>
        <Col>
          <Opt dot="green">Vitest</Opt>
          <Opt dot="green">Playwright</Opt>
          <Opt dot="green">Cypress</Opt>
          <Opt dot="green">Jest</Opt>
        </Col>
        <Main>Web APIs</Main>
        <Main>Web Security</Main>
      </Row>
      <Row>
        <div /><div />
        <Col>
          <Opt dot="green">CORS</Opt>
          <Opt dot="green">HTTPS</Opt>
          <Opt dot="green">CSP</Opt>
          <Opt dot="green">OWASP Risks</Opt>
        </Col>
      </Row>

      <Row>
        <Col>
          <Opt dot="green">Angular</Opt>
          <Opt dot="green">Vue.js</Opt>
          <Opt dot="gray">Nuxt.js</Opt>
          <Opt dot="green">SvelteKit</Opt>
          <Opt dot="gray">Svelte</Opt>
        </Col>
        <Col>
          <Opt dot="green">React</Opt>
          <Opt dot="green">Next.js</Opt>
          <Opt dot="green">Tanstack Start</Opt>
          <Opt dot="green">Astro</Opt>
          <Opt dot="green">react-router</Opt>
        </Col>
        <Main>SSR</Main>
      </Row>

      <Row>
        <Main>Deployment</Main>
        <Main>Type Checkers</Main>
        <Main>SSG</Main>
      </Row>
      <Row>
        <Col>
          <Opt dot="none">GitHub Pages</Opt>
          <Opt dot="purple">Vercel</Opt>
          <Opt dot="none">Netlify</Opt>
          <Opt dot="purple">Cloudflare</Opt>
          <Opt dot="green">Railway</Opt>
          <Opt dot="none">Render</Opt>
        </Col>
        <Blue>TypeScript</Blue>
        <Col>
          <Opt dot="purple">Astro</Opt>
          <Opt dot="green">Next.js</Opt>
          <Opt dot="green">Vuepress</Opt>
          <Opt dot="green">Eleventy</Opt>
          <Opt dot="green">Nuxt.js</Opt>
        </Col>
      </Row>

      <Row>
        <Main>Design Systems</Main><div /><div />
      </Row>
      <Row>
        <Main>Performance</Main>
        <Col>
          <Opt dot="green">Lighthouse</Opt>
          <Opt dot="green">DevTools Usage</Opt>
          <Opt dot="green">Service Workers</Opt>
          <Opt dot="green">Cache-Control</Opt>
          <Opt dot="green">Streamed Responses</Opt>
        </Col>
        <div />
      </Row>

      <Row>
        <Main>Web Components</Main>
        <Main>GraphQL</Main>
        <Main>Accessibility</Main>
      </Row>
      <Row>
        <Col>
          <Opt dot="none">HTML Templates</Opt>
          <Opt dot="none">Custom Elements</Opt>
          <Opt dot="none">Shadow DOM</Opt>
        </Col>
        <Col>
          <Opt dot="green">Apollo</Opt>
          <Opt dot="green">Relay Modern</Opt>
        </Col>
        <Main>PWAs</Main>
      </Row>

      <Row>
        <Col>
          <Opt dot="green">Electron</Opt>
          <Opt dot="none">Tauri</Opt>
          <Opt dot="none">Flutter</Opt>
        </Col>
        <Main>Desktop Apps</Main>
        <Main>Mobile Apps</Main>
      </Row>
      <Row>
        <div /><div />
        <Col>
          <Opt dot="green">React Native</Opt>
          <Opt dot="green">Flutter</Opt>
          <Opt dot="green">Ionic</Opt>
        </Col>
      </Row>

      </div>

      <div style={{ border: '1.5px solid var(--glass-border)', borderRadius: 0, padding: 16, marginTop: 24, textAlign: 'center' }}>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Continue Learning with following relevant tracks</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['Nodejs', 'Fullstack', 'Backend', 'Design System'].map(t => (
            <span key={t} style={{ background: '#3455DB', color: '#fff', fontSize: 11.5, fontWeight: 700, borderRadius: 5, padding: '6px 14px' }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
    </NodeClickContext.Provider>
  );
}
