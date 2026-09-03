'use client';
import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Bot, User, Sparkles, RotateCcw } from 'lucide-react';
import { processRAGQuery, StudentProfile } from '@/lib/aiEngine';
import { fetchStudentProfile, EMPTY_STUDENT_PROFILE } from '@/lib/userContext';

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  content: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  'What internships match my profile?',
  'Give me an AI skill gap analysis',
  'Am I eligible for PM Scheme?',
  'What is the stipend breakdown?',
  'How do I track application status?',
];

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '4px 0', alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 8, height: 8,
          background: 'var(--primary)',
          animation: `bounce 1.4s ease-in-out ${i * 0.16}s infinite`,
        }} />
      ))}
      <style>{`@keyframes bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-8px); } }`}</style>
    </div>
  );
}

function formatMessage(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: 'var(--text-primary)' }}>{part.slice(2, -2)}</strong>;
    }
    return part.split('\n').map((line, j) => (
      <span key={`${i}-${j}`}>
        {j > 0 && <br />}
        {line}
      </span>
    ));
  });
}

export default function ChatbotPage() {
  const [student, setStudent] = useState<StudentProfile>(EMPTY_STUDENT_PROFILE);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStudentProfile().then(profile => {
      setStudent(profile);
      const firstName = profile.name ? profile.name.split(' ')[0] : 'Student';
      setMessages([
        {
          id: 'init',
          role: 'bot',
          content: `Hello ${firstName}! 👋 I am **NexBot**, your RAG-powered AI career assistant for the PM Internship Scheme.\n\nI have retrieved your active competency profile (**${profile.degree} ${profile.branch}**, CGPA ${profile.cgpa}). Ask me anything about your matches, skill gaps, or scheme guidelines!`,
          timestamp: new Date(),
        },
      ]);
    });

    const handleProfileUpdate = () => {
      fetchStudentProfile().then(setStudent);
    };
    window.addEventListener('nexyuva_profile_updated', handleProfileUpdate);
    return () => window.removeEventListener('nexyuva_profile_updated', handleProfileUpdate);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    await new Promise(r => setTimeout(r, 800));

    const response = await processRAGQuery(text, student);

    const botMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'bot',
      content: response,
      timestamp: new Date(),
    };

    setIsTyping(false);
    setMessages(prev => [...prev, botMsg]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const clearChat = () => {
    const firstName = student.name ? student.name.split(' ')[0] : 'Student';
    setMessages([
      {
        id: Date.now().toString(),
        role: 'bot',
        content: `Chat history cleared. How can I assist you now, ${firstName}?`,
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <div style={{ height: 'calc(100vh - 128px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-serif)' }}>
            <div style={{ width: 40, height: 40, background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={22} color="#050505" />
            </div>
            NexBot — Context-Aware RAG Guidance
            <span className="badge badge-cyan" style={{ fontSize: 9, fontFamily: 'var(--font-mono)' }}>RAG GROUNDED</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Grounding assistance in official scheme guidelines and {student.name}'s active profile
          </p>
        </div>
        <button className="btn-ghost" onClick={clearChat}>
          <RotateCcw size={14} /> Clear Chat
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 20, minHeight: 0 }}>
        {/* Chat Window */}
        <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0, overflow: 'hidden' }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.map(msg => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  gap: 10,
                  alignItems: 'flex-end',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 32, height: 32, flexShrink: 0,
                  background: msg.role === 'bot' ? 'var(--blue)' : 'var(--bg-elevated)',
                  border: msg.role === 'user' ? '1px solid var(--glass-border)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {msg.role === 'bot'
                    ? <Bot size={16} color="#050505" />
                    : <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{student.avatar || student.name.slice(0, 2).toUpperCase()}</span>
                  }
                </div>

                {/* Bubble */}
                <div style={{
                  maxWidth: '78%',
                  padding: '12px 16px',
                  background: msg.role === 'user' ? 'var(--blue-dim)' : 'var(--bg-elevated)',
                  border: msg.role === 'bot' ? '1px solid var(--glass-border)' : '1px solid rgba(43,127,212,0.2)',
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: 'var(--text-primary)',
                }}>
                  {formatMessage(msg.content)}
                  <div style={{ fontSize: 10, color: msg.role === 'user' ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ width: 32, height: 32, background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Bot size={16} color="#050505" />
                </div>
                <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)' }}>
                  <TypingIndicator />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div style={{ borderTop: '1px solid var(--glass-border)', padding: 20 }}>
            {/* Quick prompts */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {QUICK_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  style={{
                    padding: '5px 12px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)',
                    color: 'var(--text-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10 }}>
              <input
                id="chat-input"
                className="input-field"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={`Ask NexBot about internships, skill gaps, or scheme eligibility...`}
                style={{ flex: 1 }}
                disabled={isTyping}
              />
              <button
                type="submit"
                className="btn-primary"
                style={{ padding: '10px 16px', flexShrink: 0 }}
                disabled={!input.trim() || isTyping}
              >
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>

        {/* Context Sidebar */}
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="glass-card" style={{ padding: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)' }}>ACTIVE STUDENT CONTEXT</h4>
            {[
              { label: 'Name', value: student.name },
              { label: 'Degree', value: `${student.degree} ${student.branch}` },
              { label: 'CGPA', value: `${student.cgpa} / 10` },
              { label: 'Vector Skills', value: `${student.skills.length} added` },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{item.value}</span>
              </div>
            ))}
          </div>

          <div className="glass-card" style={{ padding: 20 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text-secondary)' }}>SUGGESTED RAG QUERIES</h4>
            {[
              'Give me a skill roadmap',
              'Explain PM Scheme stipend rules',
              'What is my top match?',
              'How to improve ATS resume score?',
            ].map(topic => (
              <button
                key={topic}
                onClick={() => sendMessage(topic)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '8px 0', background: 'none', border: 'none',
                  borderBottom: '1px solid var(--glass-border)', cursor: 'pointer',
                  color: 'var(--text-secondary)', fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase'
                }}
              >
                {topic}
                <Sparkles size={11} color="var(--accent-amber)" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
