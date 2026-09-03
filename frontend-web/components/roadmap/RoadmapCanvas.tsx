'use client';
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { CheckCircle2, BookOpen, X as XIcon } from 'lucide-react';
import type { RoadmapStage } from '@/lib/roadmaps';
import { useTopicStatusMap, TopicStatus } from '@/lib/topicStatus';

type IconType = React.ComponentType<{ size?: number; color?: string }>;

interface Props {
  stages: RoadmapStage[];
  accent: string;
  branchAccent: string;
  optionalStageName: string;
  roadmapId: string;
  getTopicIcon: (title: string) => [IconType, string];
  isCovered: (title: string) => boolean;
  onNodeClick: (topic: { title: string; note: string }) => void;
}

interface Edge { d: string; dashed: boolean; }

interface FlatNode {
  title: string;
  note: string;
  stage: string;
  stageIndex: number;
  dependsOn: string[];
  isOptionalStage: boolean;
}

// Builds the full node list with a real dependency edge per node: an
// explicit `dependsOn` from roadmap data when the topic authors one
// (letting a topic branch off an earlier one, or converge from more than
// one prerequisite), falling back to "depends on whatever topic came right
// before it" otherwise -- so untouched roadmaps keep behaving exactly like
// the old single-chain layout.
function buildFlatNodes(stages: RoadmapStage[], optionalStageName: string): FlatNode[] {
  const flat: FlatNode[] = [];
  let prevTitle: string | null = null;
  for (let si = 0; si < stages.length; si++) {
    const s = stages[si];
    for (const t of s.topics) {
      const dependsOn = t.dependsOn && t.dependsOn.length > 0
        ? t.dependsOn
        : (prevTitle ? [prevTitle] : []);
      flat.push({
        title: t.title, note: t.note, stage: s.stage, stageIndex: si,
        dependsOn, isOptionalStage: s.stage === optionalStageName,
      });
      prevTitle = t.title;
    }
  }
  return flat;
}

// Lays a single stage's nodes out into rows ("layers"): a node with no
// dependency on another node in *this* stage starts a new row at layer 0;
// a node depending on one or more same-stage nodes sits one row below the
// deepest of its parents. Cross-stage / skip-ahead dependencies (the
// dependency lives in an earlier stage) don't affect row placement -- they
// just draw a longer connector -- so branching stays local and readable.
function layoutStageRows(nodes: FlatNode[]): FlatNode[][] {
  const titles = new Set(nodes.map(n => n.title));
  const layerOf = new Map<string, number>();
  for (const n of nodes) {
    const localParents = n.dependsOn.filter(d => titles.has(d) && d !== n.title);
    const layer = localParents.length === 0
      ? 0
      : 1 + Math.max(...localParents.map(p => layerOf.get(p) ?? 0));
    layerOf.set(n.title, layer);
  }
  const maxLayer = Math.max(0, ...nodes.map(n => layerOf.get(n.title) ?? 0));
  const rows: FlatNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const n of nodes) rows[layerOf.get(n.title) ?? 0].push(n);
  return rows;
}

// Real SVG connector graph: measures rendered node positions via refs, then
// draws one cubic-bezier <path> per dependency edge (not just "consecutive
// nodes") so a topic with two prerequisites shows two converging curves,
// and a topic that unlocks three others shows three diverging curves.
// Recomputes on resize so it stays correct at any viewport width.
export default function RoadmapCanvas({
  stages, accent, branchAccent, optionalStageName, roadmapId, getTopicIcon, isCovered, onNodeClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [edges, setEdges] = useState<Edge[]>([]);
  const [svgHeight, setSvgHeight] = useState(0);
  const [hoveredTitle, setHoveredTitle] = useState<string | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNode = useCallback((title: string) => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    setHoveredTitle(title);
  }, []);
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    // Small grace period so a brief gap/jitter moving from the node up to
    // the status toolbar doesn't instantly dismiss it -- only a genuine
    // move-away (cursor stays off both for 300ms) hides it.
    hideTimerRef.current = setTimeout(() => setHoveredTitle(null), 300);
  }, []);
  useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }, []);
  const [statusMap, setStatus] = useTopicStatusMap(roadmapId);

  const flatNodes = buildFlatNodes(stages, optionalStageName);

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const newEdges: Edge[] = [];

    for (const node of flatNodes) {
      const curEl = nodeRefs.current[node.title];
      if (!curEl) continue;
      const c = curEl.getBoundingClientRect();
      const x2 = c.left + c.width / 2 - containerRect.left;
      const y2 = c.top - containerRect.top;

      for (const parentTitle of node.dependsOn) {
        const parentEl = nodeRefs.current[parentTitle];
        if (!parentEl) continue;
        const p = parentEl.getBoundingClientRect();
        const x1 = p.left + p.width / 2 - containerRect.left;
        const y1 = p.bottom - containerRect.top;
        const midY = (y1 + y2) / 2;
        const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
        newEdges.push({ d, dashed: node.isOptionalStage });
      }
    }

    setEdges(newEdges);
    setSvgHeight(container.scrollHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    const onResize = () => recompute();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { window.removeEventListener('resize', onResize); ro.disconnect(); };
  }, [recompute]);

  return (
    <div ref={containerRef} style={{ position: 'relative', maxWidth: 760, margin: '0 auto', paddingBottom: 40 }}>
      {/* SVG connector overlay */}
      <svg
        width="100%"
        height={svgHeight}
        style={{ position: 'absolute', top: 0, left: 0, zIndex: 0, pointerEvents: 'none', overflow: 'visible' }}
      >
        {edges.map((e, i) => (
          <path
            key={i}
            d={e.d}
            fill="none"
            stroke={e.dashed ? branchAccent : accent}
            strokeWidth={2.5}
            strokeDasharray={e.dashed ? '6 5' : undefined}
            opacity={0.55}
            className="roadmap-edge"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </svg>
      <style>{`
        @keyframes roadmap-edge-draw { from { opacity: 0; } to { opacity: 0.55; } }
        .roadmap-edge { animation: roadmap-edge-draw 0.4s ease forwards; }
      `}</style>

      {stages.map((stage) => {
        const isOptional = stage.stage === optionalStageName;
        const lineColor = isOptional ? branchAccent : accent;
        const stageNodes = flatNodes.filter(n => n.stage === stage.stage);
        const rows = layoutStageRows(stageNodes);

        return (
          <div key={stage.stage}>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0 14px', position: 'relative', zIndex: 1 }}>
              <div style={{
                background: 'var(--void)', border: `1px solid ${lineColor}50`, color: lineColor,
                borderRadius: 'var(--radius-px)', padding: '3px 14px', fontSize: 10.5, fontWeight: 700,
                fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>{stage.stage}{isOptional ? ' \u00b7 optional' : ''}</div>
            </div>

            {rows.map((row, ri) => (
              <div
                key={ri}
                style={{
                  display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
                  gap: '28px 20px', marginBottom: 28, position: 'relative', zIndex: 1,
                }}
              >
                {row.map((node) => {
                  const covered = isCovered(node.title);
                  const status: TopicStatus | null = statusMap[node.title] ?? null;
                  const [TopicIcon, topicColor] = getTopicIcon(node.title);

                  const STATUS_COLOR: Record<TopicStatus, string> = {
                    learning: '#9B5DE5', done: '#4AAA82', skip: '#8A8A8A',
                  };
                  const borderColor = status ? STATUS_COLOR[status] : (covered ? '#4AAA82' : topicColor);
                  const bgColor = status === 'done'
                    ? 'rgba(74,170,130,0.16)'
                    : status === 'learning'
                      ? 'rgba(155,93,229,0.14)'
                      : status === 'skip'
                        ? 'rgba(138,138,138,0.14)'
                        : (covered ? 'rgba(74,170,130,0.16)' : topicColor + '1f');
                  const textColor = status ? STATUS_COLOR[status] : (covered ? '#4AAA82' : 'var(--text-primary)');
                  const textDecoration = status === 'done' || status === 'skip' ? 'line-through' : (status === 'learning' ? 'underline' : 'none');

                  const STATUS_OPTIONS: { key: TopicStatus; label: string; icon: IconType; color: string }[] = [
                    { key: 'learning', label: 'Learning', icon: BookOpen, color: '#9B5DE5' },
                    { key: 'done', label: 'Done', icon: CheckCircle2, color: '#4AAA82' },
                    { key: 'skip', label: 'Skip', icon: XIcon, color: '#8A8A8A' },
                  ];

                  return (
                    <div
                      key={node.title}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 190, position: 'relative' }}
                      onMouseEnter={() => showNode(node.title)}
                      onMouseLeave={scheduleHide}
                    >
                      {hoveredTitle === node.title && (
                        <div
                          onMouseEnter={() => showNode(node.title)}
                          onMouseLeave={scheduleHide}
                          style={{
                            position: 'absolute', top: -34, left: '50%', transform: 'translateX(-50%)',
                            display: 'flex', background: 'var(--void-card)', border: 'var(--px-border)',
                            borderRadius: 'var(--radius-px)', overflow: 'hidden', zIndex: 3,
                            boxShadow: '0 2px 10px rgba(0,0,0,0.35)', whiteSpace: 'nowrap',
                          }}
                        >
                          {STATUS_OPTIONS.map((opt, oi) => {
                            const active = status === opt.key;
                            const OptIcon = opt.icon;
                            return (
                              <button
                                key={opt.key}
                                onClick={(e) => { e.stopPropagation(); setStatus(node.title, opt.key); }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px',
                                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                  background: active ? opt.color : 'transparent',
                                  color: active ? '#fff' : 'var(--text-secondary)',
                                  border: 'none', borderLeft: oi > 0 ? 'var(--px-border)' : 'none',
                                }}
                              >
                                <OptIcon size={12} color={active ? '#fff' : opt.color} /> {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <button
                        ref={el => { nodeRefs.current[node.title] = el; }}
                        onClick={() => onNodeClick({ title: node.title, note: node.note })}
                        title={`Open ${node.title} learning hub`}
                        style={{
                          background: bgColor,
                          border: `2px solid ${borderColor}`,
                          borderRadius: 8, padding: '9px 10px', cursor: 'pointer', width: '100%',
                          display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
                          transition: 'transform 0.12s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                      >
                        <TopicIcon size={15} color={status ? STATUS_COLOR[status] : (covered ? '#4AAA82' : topicColor)} />
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: textColor, textDecoration, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {node.title}
                        </span>
                        {(status === 'done' || (!status && covered)) && <CheckCircle2 size={13} color="#4AAA82" />}
                      </button>
                      <p style={{
                        fontSize: 10.5, color: 'var(--text-muted)', lineHeight: 1.4, textAlign: 'center',
                        marginTop: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>{node.note}</p>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
