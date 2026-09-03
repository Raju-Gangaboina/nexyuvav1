'use client';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ShieldCheck, Eye, TrendingUp, FileCheck2 } from 'lucide-react';

export default function BadgeDetailsPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const router = useRouter();

  const points = [
    { icon: ShieldCheck, text: 'Trusted by recruiters' },
    { icon: Eye, text: 'Confirms AI verification' },
    { icon: TrendingUp, text: 'Improves profile visibility' },
    { icon: FileCheck2, text: 'Appears on applications' },
  ];

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
      <div className="glass-card" style={{ padding: 40 }}>
        <Image
          src="/badge.png"
          alt="Stand-Out Candidate Badge"
          width={230}
          height={230}
          style={{ margin: '0 auto 20px' }}
        />

        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 14 }}>Stand-Out Candidate Badge</h1>

        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 28, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
          Earned by passing a short AI-graded interview for this role, proctored live
          through your webcam. Your answers are scored against the company&apos;s own
          questions and cross-checked with your resume - giving recruiters verified
          proof of your skills, not just a static application.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32, textAlign: 'left' }}>
          {points.map(({ icon: Icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 16, height: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} color="#4AAA82" />
              </span>
              {text}
            </div>
          ))}
        </div>

        <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => router.push(`/student/interview/${applicationId}`)}>
          Earn My Badge
        </button>
      </div>
    </div>
  );
}
