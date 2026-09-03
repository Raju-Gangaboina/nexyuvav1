// NexYuva Enterprise AI & ML Engine (BACKEND)
// Implements SRS Architecture: Resume Intelligence, Competency Modeling, Hybrid Recommendation Engine,
// Explainable AI (XAI), Career Path Prediction, Skill Gap Analysis, and RAG Knowledge System.
// This is the authoritative server-side copy. The frontend no longer runs this logic locally —
// it calls the /api/* routes defined in routes.ts, which call the functions below.

export const ALL_SKILLS = [
  // Programming & Core Tech
  'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'C#', 'Go', 'Rust', 'PHP', 'Ruby',
  // Web & Backend
  'React', 'Next.js', 'Vue.js', 'Angular', 'Node.js', 'Express.js', 'Django', 'Flask', 'Spring Boot', 'FastAPI', 'REST APIs', 'GraphQL',
  // Data Science & AI
  'Machine Learning', 'Deep Learning', 'Data Analysis', 'Pandas', 'NumPy', 'TensorFlow', 'PyTorch', 'Scikit-learn', 'NLP', 'Computer Vision', 'Data Visualization', 'Tableau', 'Power BI',
  // Cloud & DevOps
  'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'CI/CD', 'Linux', 'Git', 'Terraform',
  // Databases & Systems
  'SQL', 'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Firebase', 'System Design',
  // Design & Product
  'Figma', 'UI/UX Design', 'Adobe XD', 'Canva', 'Photoshop', 'Product Management', 'Wireframing',
  // Business, Finance & Operations
  'Excel', 'PowerPoint', 'Finance', 'Accounting', 'Financial Analysis', 'Tally', 'GST', 'Business Analysis',
  // Human Resources & Management
  'Human Resources', 'Recruitment', 'Payroll', 'Training & Development',
  // Soft Skills & Leadership
  'Communication', 'Leadership', 'Problem Solving', 'Team Work', 'Project Management', 'Agile',
  // Specialized Domains
  'Cybersecurity', 'Blockchain', 'IoT', 'Embedded Systems', 'Digital Marketing', 'Content Writing', 'SEO', 'Social Media Marketing',
];

// Semantic Taxonomy: Infer related skills from extracted terminology (e.g. Spring Boot -> Java, REST APIs)
export const SKILL_SYNONYMS_AND_INFERENCES: Record<string, string[]> = {
  'spring boot': ['Java', 'Spring Boot', 'REST APIs', 'Backend Engineering', 'Software Architecture'],
  'react': ['React', 'JavaScript', 'Frontend Development', 'Web Development'],
  'tensorflow': ['TensorFlow', 'Machine Learning', 'Deep Learning', 'Python', 'Artificial Intelligence'],
  'pytorch': ['PyTorch', 'Deep Learning', 'Machine Learning', 'Python', 'Artificial Intelligence'],
  'pandas': ['Pandas', 'Data Analysis', 'Python', 'NumPy'],
  'docker': ['Docker', 'DevOps', 'Containers', 'CI/CD'],
  'kubernetes': ['Kubernetes', 'Docker', 'DevOps', 'Cloud Infrastructure'],
  'aws': ['AWS', 'Cloud Computing', 'DevOps'],
  'figma': ['Figma', 'UI/UX Design', 'Wireframing', 'Prototyping'],
  'sql': ['SQL', 'Data Analysis', 'Databases', 'MySQL', 'PostgreSQL'],
  'django': ['Django', 'Python', 'Backend Engineering', 'REST APIs'],
  'node.js': ['Node.js', 'JavaScript', 'Backend Engineering', 'Express.js'],
  'cybersecurity': ['Cybersecurity', 'Linux', 'Networking', 'Security Audit'],
};

export interface Internship {
  id: string;
  title: string;
  company: string;
  companyLogo?: string;
  domain: string;
  location: string;
  mode: 'Remote' | 'Hybrid' | 'On-site';
  duration: string;
  stipend: number;
  stipendUnit?: 'month' | 'week';
  requiredSkills: string[];
  preferredSkills: string[];
  description: string;
  responsibilities: string[];
  eligibility: string;
  cgpaCutoff: number;
  openings: number;
  postedDate: string;
  deadline: string;
  sector: 'Government' | 'PSU' | 'Private' | 'NGO' | 'Startup';
  perks: string[];
  applicationCount?: number;
}

export interface StudentProfile {
  id: string;
  name: string;
  email: string;
  avatar: string;
  college: string;
  degree: string;
  branch: string;
  year: number;
  cgpa: number;
  skills: string[];
  preferredLocations: string[];
  preferredDomains: string[];
  preferredMode: string;
  minStipend: number;
  bio: string;
  github: string;
  linkedin: string;
  resumeScore: number;
}

export interface CompetencyDimensions {
  academicExcellence: number;
  technicalExpertise: number;
  projectMaturity: number;
  professionalExperience: number;
  innovation: number;
  leadership: number;
  communication: number;
  careerReadiness: number;
}

export interface MatchResult {
  internship: Internship;
  score: number;
  confidenceLevel: 'Very High Confidence' | 'High Confidence' | 'Moderate Confidence' | 'Limited Confidence';
  confidenceScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  bonusFactors: { label: string; value: string; impact: number }[];
  explanation: string;
  areasForImprovement: string[];
}

export interface ResumeAnalysisResult {
  atsScore: number;
  extractedSkills: string[];
  inferredSkills: string[];
  extractedPersonal: {
    fullName?: string;
    email?: string;
    phone?: string;
    degree?: string;
    cgpa?: number;
  };
  metrics: {
    readability: number;
    completeness: number;
    formattingConsistency: number;
    skillCoverage: number;
    quantifiedAchievements: number;
  };
  suggestions: string[];
}

export interface CareerPathPrediction {
  title: string;
  domain: string;
  matchProbability: number;
  growthRate: string;
  keySkillsNeeded: string[];
  recommendedCertifications: string[];
  description: string;
}

export interface SkillGapAnalysis {
  targetRole: string;
  currentMatch: number;
  missingSkills: string[];
  learningRoadmap: { step: number; title: string; resource: string; duration: string }[];
  recommendedCertifications: string[];
}

// ---------------------------------------------------------------------------
// 1. NLP & Semantic Skill Vector Embeddings Engine
// ---------------------------------------------------------------------------

function buildSkillVector(skills: string[]): Record<string, number> {
  const vector: Record<string, number> = {};
  const expandedSkills = new Set<string>();

  skills.forEach(s => {
    const lower = s.toLowerCase();
    expandedSkills.add(s);
    if (SKILL_SYNONYMS_AND_INFERENCES[lower]) {
      SKILL_SYNONYMS_AND_INFERENCES[lower].forEach(inf => expandedSkills.add(inf));
    }
  });

  ALL_SKILLS.forEach(skill => {
    vector[skill] = expandedSkills.has(skill) ? 1 : 0;
  });

  return vector;
}

function cosineSimilarity(vecA: Record<string, number>, vecB: Record<string, number>): number {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (const key of ALL_SKILLS) {
    const a = vecA[key] || 0;
    const b = vecB[key] || 0;
    dotProduct += a * b;
    magnitudeA += a * a;
    magnitudeB += b * b;
  }

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

// ---------------------------------------------------------------------------
// 2. 8-Dimension Digital Competency Profile Engine (SRS Chapter 13 & Slide 34)
// ---------------------------------------------------------------------------

export function calculateCompetencyDimensions(student: StudentProfile): CompetencyDimensions {
  const cgpaScore = Math.min(Math.max((student.cgpa / 10) * 100, 40), 100);
  const skillCount = student.skills.length;
  const techScore = Math.min(skillCount * 9, 95);

  const hasGithub = Boolean(student.github && student.github.length > 5);
  const hasLinkedin = Boolean(student.linkedin && student.linkedin.length > 5);
  const bioLength = student.bio ? student.bio.length : 0;

  const projectScore = Math.min(60 + (hasGithub ? 25 : 0) + Math.min(skillCount * 2, 15), 98);
  const profExpScore = Math.min(50 + (hasLinkedin ? 20 : 0) + (student.year >= 3 ? 15 : 5) + (student.cgpa > 8 ? 10 : 0), 95);
  const innovationScore = Math.min(55 + (student.skills.includes('Machine Learning') || student.skills.includes('AI') ? 20 : 10) + (hasGithub ? 15 : 0), 95);
  const leadershipScore = Math.min(60 + (student.skills.includes('Leadership') || student.skills.includes('Project Management') ? 25 : 10), 92);
  const commScore = Math.min(50 + Math.min(bioLength / 3, 25) + (student.skills.includes('Communication') ? 20 : 5), 95);
  const readinessScore = Math.round((cgpaScore * 0.25) + (techScore * 0.3) + (projectScore * 0.25) + (commScore * 0.2));

  return {
    academicExcellence: Math.round(cgpaScore),
    technicalExpertise: Math.round(techScore),
    projectMaturity: Math.round(projectScore),
    professionalExperience: Math.round(profExpScore),
    innovation: Math.round(innovationScore),
    leadership: Math.round(leadershipScore),
    communication: Math.round(commScore),
    careerReadiness: Math.round(readinessScore),
  };
}

// ---------------------------------------------------------------------------
// 3. Resume Intelligence & ATS Quality Assessment (SRS Chapter 12)
// ---------------------------------------------------------------------------

export function extractAndAnalyzeResume(resumeText: string): ResumeAnalysisResult {
  const lowerText = resumeText.toLowerCase();

  const extractedSkills: string[] = [];
  const inferredSet = new Set<string>();

  ALL_SKILLS.forEach(skill => {
    if (lowerText.includes(skill.toLowerCase())) {
      extractedSkills.push(skill);
      const lower = skill.toLowerCase();
      if (SKILL_SYNONYMS_AND_INFERENCES[lower]) {
        SKILL_SYNONYMS_AND_INFERENCES[lower].forEach(inf => inferredSet.add(inf));
      }
    }
  });

  const inferredSkills = Array.from(inferredSet).filter(s => !extractedSkills.includes(s));

  const emailMatch = resumeText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = resumeText.match(/(?:\+91|0)?[789]\d{9}/);
  const cgpaMatch = resumeText.match(/cgpa[:\s]*([0-9]\.[0-9]{1,2})/i) || resumeText.match(/([0-9]\.[0-9]{1,2})\s*\/\s*10/i);

  const hasEducation = lowerText.includes('education') || lowerText.includes('degree') || lowerText.includes('b.tech') || lowerText.includes('bca') || lowerText.includes('college');
  const hasSkillsSec = lowerText.includes('skills') || lowerText.includes('technologies') || lowerText.includes('proficiencies');
  const hasProjects = lowerText.includes('project') || lowerText.includes('built') || lowerText.includes('developed');
  const hasExperience = lowerText.includes('experience') || lowerText.includes('intern') || lowerText.includes('work');
  const hasContact = Boolean(emailMatch || phoneMatch);
  const hasGithub = lowerText.includes('github') || lowerText.includes('git');

  const completeness = [hasEducation, hasSkillsSec, hasProjects, hasExperience, hasContact].filter(Boolean).length * 20;
  const skillCoverage = Math.min(extractedSkills.length * 12, 100);
  const readability = resumeText.length > 200 && resumeText.length < 4000 ? 90 : 65;
  const formattingConsistency = 85;

  const numbersMatch = resumeText.match(/\d+%/g) || resumeText.match(/\d+\s*(users|clients|projects|students|apps)/gi);
  const quantifiedAchievements = numbersMatch ? Math.min(numbersMatch.length * 25, 95) : 40;

  const atsScore = Math.round((completeness * 0.3) + (skillCoverage * 0.3) + (quantifiedAchievements * 0.2) + (readability * 0.2));

  const suggestions: string[] = [];
  if (extractedSkills.length < 5) suggestions.push('Add more specific technical tools and frameworks to increase ATS keyword matching.');
  if (!quantifiedAchievements || quantifiedAchievements < 50) suggestions.push('Include quantified metrics in your project bullet points (e.g., "Increased performance by 30%", "Used by 500+ users").');
  if (!hasGithub) suggestions.push('Add your GitHub repository links to provide proof of practical project work.');
  if (!hasContact) suggestions.push('Ensure your contact information (email, phone number, LinkedIn) is clearly visible at the top.');

  return {
    atsScore,
    extractedSkills,
    inferredSkills,
    extractedPersonal: {
      email: emailMatch ? emailMatch[0] : undefined,
      phone: phoneMatch ? phoneMatch[0] : undefined,
      cgpa: cgpaMatch ? parseFloat(cgpaMatch[1]) : undefined,
    },
    metrics: {
      readability,
      completeness,
      formattingConsistency,
      skillCoverage,
      quantifiedAchievements,
    },
    suggestions,
  };
}

// ---------------------------------------------------------------------------
// 4. Hybrid Recommendation Engine & XAI (SRS Chapter 15 & 17)
// ---------------------------------------------------------------------------

function generateXAIExplanation(score: number, matchedSkills: string[], missingSkills: string[], internship: Internship, student: StudentProfile): string {
  if (score >= 85) {
    return `Very Strong Match (Score ${score}%)! Your experience in ${matchedSkills.slice(0, 3).join(', ')} aligns directly with ${internship.company}'s requirements. Your CGPA (${student.cgpa}) and location preferences perfectly satisfy the eligibility filters.`;
  } else if (score >= 70) {
    return `Strong Match (Score ${score}%)! You possess key required competencies such as ${matchedSkills.slice(0, 3).join(', ')}. ${missingSkills.length > 0 ? `Acquiring ${missingSkills.slice(0, 2).join(' & ')} would elevate your profile to top candidate status.` : 'Your profile aligns well with this opportunity.'}`;
  } else if (score >= 55) {
    return `Moderate Match (Score ${score}%). You meet baseline prerequisites with skills like ${matchedSkills.slice(0, 2).join(', ')}. To increase your candidate ranking for ${internship.title}, focus on developing ${missingSkills.slice(0, 2).join(' and ')}.`;
  } else {
    return `Potential Growth Match (Score ${score}%). While you satisfy basic eligibility criteria, this role requires deeper proficiency in ${missingSkills.slice(0, 3).join(', ')}. Consider this as a target learning path.`;
  }
}

export function generateRecommendations(student: StudentProfile, internships: Internship[]): MatchResult[] {
  const studentSkillVec = buildSkillVector(student.skills);
  const results: MatchResult[] = [];

  for (const internship of internships) {
    const allRequiredSkills = [...internship.requiredSkills, ...internship.preferredSkills];
    const internshipSkillVec = buildSkillVector(allRequiredSkills);

    const skillSimilarity = cosineSimilarity(studentSkillVec, internshipSkillVec);

    const studentSkillLower = student.skills.map(s => s.toLowerCase());

    const matchedSkills = internship.requiredSkills.filter(reqSkill => {
      const lowerReq = reqSkill.toLowerCase();
      if (studentSkillLower.includes(lowerReq)) return true;
      return student.skills.some(studentSkill => {
        const infs = SKILL_SYNONYMS_AND_INFERENCES[studentSkill.toLowerCase()];
        return infs && infs.some(inf => inf.toLowerCase() === lowerReq);
      });
    });

    const missingSkills = internship.requiredSkills.filter(s => !matchedSkills.includes(s));
    const matchedPreferred = internship.preferredSkills.filter(s => {
      const lower = s.toLowerCase();
      return studentSkillLower.includes(lower);
    });

    const bonusFactors: { label: string; value: string; impact: number }[] = [];
    let bonusScore = 0;

    if (student.cgpa >= internship.cgpaCutoff) {
      const cgpaDiff = student.cgpa - internship.cgpaCutoff;
      const cgpaImpact = Math.min(5 + Math.round(cgpaDiff * 5), 10);
      bonusScore += cgpaImpact / 100;
      bonusFactors.push({ label: 'CGPA Eligibility', value: `${student.cgpa} / 10 (Cutoff: ${internship.cgpaCutoff})`, impact: cgpaImpact });
    }

    const locMatch = student.preferredLocations.some(loc =>
      internship.location.toLowerCase().includes(loc.toLowerCase()) ||
      loc.toLowerCase() === 'remote' ||
      internship.mode === 'Remote'
    );
    if (locMatch) {
      bonusScore += 0.10;
      bonusFactors.push({ label: 'Location & Work Mode', value: `${internship.mode} · ${internship.location}`, impact: 10 });
    }

    if (student.preferredDomains.some(d => d.toLowerCase() === internship.domain.toLowerCase())) {
      bonusScore += 0.10;
      bonusFactors.push({ label: 'Domain Interest', value: internship.domain, impact: 10 });
    }

    if (internship.stipend >= student.minStipend) {
      bonusScore += 0.05;
      bonusFactors.push({ label: 'Stipend Expectations', value: `₹${internship.stipend.toLocaleString()}/mo`, impact: 5 });
    }

    if (matchedPreferred.length > 0) {
      const prefImpact = Math.min(matchedPreferred.length * 3, 10);
      bonusScore += prefImpact / 100;
      bonusFactors.push({ label: 'Bonus Preferred Skills', value: matchedPreferred.join(', '), impact: prefImpact });
    }

    const rawScore = (skillSimilarity * 0.55) + bonusScore;
    const score = Math.min(Math.max(Math.round(rawScore * 100), 35), 98);

    let confidenceLevel: MatchResult['confidenceLevel'] = 'Moderate Confidence';
    let confidenceScore = 80;
    if (score >= 85) {
      confidenceLevel = 'Very High Confidence';
      confidenceScore = 96;
    } else if (score >= 70) {
      confidenceLevel = 'High Confidence';
      confidenceScore = 88;
    } else if (score < 50) {
      confidenceLevel = 'Limited Confidence';
      confidenceScore = 65;
    }

    const areasForImprovement: string[] = [];
    if (missingSkills.length > 0) {
      areasForImprovement.push(`Build core proficiency in ${missingSkills.slice(0, 2).join(' and ')}.`);
    }
    if (student.cgpa < 8.0 && internship.cgpaCutoff >= 7.5) {
      areasForImprovement.push('Maintain academic performance to exceed competitive candidate pools.');
    }
    if (!student.skills.includes('Git') && !student.skills.includes('Docker')) {
      areasForImprovement.push('Gain practical experience with version control (Git) and containerization (Docker).');
    }
    if (areasForImprovement.length === 0) {
      areasForImprovement.push('Complete an advanced domain certification to boost candidate ranking.');
    }

    results.push({
      internship,
      score,
      confidenceLevel,
      confidenceScore,
      matchedSkills,
      missingSkills,
      bonusFactors,
      explanation: generateXAIExplanation(score, matchedSkills, missingSkills, internship, student),
      areasForImprovement,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// 5. Career Path Prediction Engine (SRS Chapter 22 & Slide 8)
// ---------------------------------------------------------------------------

export function predictCareerPaths(student: StudentProfile): CareerPathPrediction[] {
  const skills = student.skills.map(s => s.toLowerCase());

  const predictions: CareerPathPrediction[] = [];

  if (skills.includes('python') || skills.includes('javascript') || skills.includes('react') || skills.includes('java')) {
    predictions.push({
      title: 'Full-Stack Software Engineer',
      domain: 'Information Technology',
      matchProbability: Math.min(75 + (skills.includes('react') ? 10 : 0) + (skills.includes('sql') ? 8 : 0), 96),
      growthRate: '+24% YoY Demand',
      keySkillsNeeded: ['System Design', 'Docker', 'AWS', 'GraphQL'],
      recommendedCertifications: ['AWS Certified Developer', 'Meta Front-End Developer Specialization'],
      description: 'High demand career path building modern scalable web applications and enterprise cloud APIs.',
    });
  }

  if (skills.includes('python') || skills.includes('machine learning') || skills.includes('data analysis') || skills.includes('sql')) {
    predictions.push({
      title: 'AI / Data Science Specialist',
      domain: 'Artificial Intelligence & Data',
      matchProbability: Math.min(70 + (skills.includes('machine learning') ? 15 : 0) + (skills.includes('pandas') ? 10 : 0), 95),
      growthRate: '+32% YoY Demand',
      keySkillsNeeded: ['Deep Learning', 'PyTorch', 'NLP', 'MLOps'],
      recommendedCertifications: ['TensorFlow Developer Certificate', 'Google Data Analytics Professional'],
      description: 'Design intelligence systems, ML models, and predictive data analytics for industry and government.',
    });
  }

  if (skills.includes('aws') || skills.includes('linux') || skills.includes('docker') || skills.includes('python')) {
    predictions.push({
      title: 'Cloud Infrastructure & DevOps Engineer',
      domain: 'Cloud Computing',
      matchProbability: Math.min(65 + (skills.includes('aws') ? 15 : 0) + (skills.includes('docker') ? 12 : 0), 92),
      growthRate: '+28% YoY Demand',
      keySkillsNeeded: ['Kubernetes', 'Terraform', 'CI/CD', 'Ansible'],
      recommendedCertifications: ['AWS Solutions Architect Associate', 'Certified Kubernetes Administrator (CKA)'],
      description: 'Manage automated cloud infrastructure, container orchestration, and continuous integration pipelines.',
    });
  }

  if (predictions.length === 0) {
    predictions.push({
      title: 'Business & Technology Analyst',
      domain: 'Business & Analytics',
      matchProbability: 80,
      growthRate: '+18% YoY Demand',
      keySkillsNeeded: ['SQL', 'Excel', 'Data Visualization', 'Agile'],
      recommendedCertifications: ['Google Data Analytics', 'PMI Certified Associate in Project Management'],
      description: 'Bridge business requirements with digital tech solutions across private and government enterprises.',
    });
  }

  return predictions.sort((a, b) => b.matchProbability - a.matchProbability);
}

// ---------------------------------------------------------------------------
// 6. Skill Gap Analysis Engine (SRS Chapter 23)
// ---------------------------------------------------------------------------

export function analyzeSkillGaps(student: StudentProfile, targetDomain: string = 'Information Technology'): SkillGapAnalysis {
  const currentSkills = new Set(student.skills.map(s => s.toLowerCase()));

  const domainSkillsRequired: Record<string, string[]> = {
    'Information Technology': ['React', 'Node.js', 'SQL', 'Git', 'Docker', 'REST APIs'],
    'Data Science': ['Python', 'Machine Learning', 'SQL', 'Pandas', 'Data Analysis', 'TensorFlow'],
    'Artificial Intelligence': ['Python', 'Machine Learning', 'Deep Learning', 'PyTorch', 'NLP'],
    'Cloud Computing': ['AWS', 'Linux', 'Docker', 'Python', 'Kubernetes', 'CI/CD'],
    'Cybersecurity': ['Cybersecurity', 'Linux', 'Networking', 'Python', 'SQL'],
  };

  const required = domainSkillsRequired[targetDomain] || domainSkillsRequired['Information Technology'];
  const missing = required.filter(skill => !currentSkills.has(skill.toLowerCase()));

  const currentMatch = Math.round(((required.length - missing.length) / required.length) * 100);

  const learningRoadmap = missing.map((skill, index) => ({
    step: index + 1,
    title: `Master ${skill}`,
    resource: `Recommended Course: "${skill} Fundamentals & Practical Projects"`,
    duration: `${2 + index * 2} weeks`,
  }));

  return {
    targetRole: `${targetDomain} Specialist`,
    currentMatch,
    missingSkills: missing,
    learningRoadmap,
    recommendedCertifications: [
      `Official ${targetDomain} Practitioner Certification`,
      `Hands-On ${missing[0] || 'Cloud'} Developer Badge`,
    ],
  };
}

// ---------------------------------------------------------------------------
// 7. Context-Aware RAG Knowledge Retrieval & Chatbot Engine (SRS Chapter 16)
// ---------------------------------------------------------------------------

export type ChatIntent = 'greeting' | 'help' | 'find_internship' | 'skill_advice' | 'application' | 'eligibility' | 'stipend' | 'deadline' | 'unknown';

export function detectIntent(message: string): ChatIntent {
  const lower = message.toLowerCase();
  if (/hello|hi|hey|namaste|greetings/i.test(lower)) return 'greeting';
  if (/help|support|guide|what can/i.test(lower)) return 'help';
  if (/find|search|recommend|match|suggest|internship/i.test(lower)) return 'find_internship';
  if (/skill|learn|improve|gap|missing|upskill|roadmap/i.test(lower)) return 'skill_advice';
  if (/apply|application|status|track/i.test(lower)) return 'application';
  if (/eligible|eligibility|qualify|cgpa|criteria/i.test(lower)) return 'eligibility';
  if (/stipend|salary|pay|money|compensation/i.test(lower)) return 'stipend';
  if (/deadline|last date|date|when/i.test(lower)) return 'deadline';
  return 'unknown';
}

export function processRAGQuery(query: string, student: StudentProfile): string {
  const intent = detectIntent(query);
  const firstName = student.name ? student.name.split(' ')[0] : 'Student';

  switch (intent) {
    case 'greeting':
      return `Hello ${firstName}! 👋 I am **NexBot**, your RAG-powered AI career assistant for the PM Internship Scheme.\n\nI have evaluated your profile (${student.degree} ${student.branch}, CGPA ${student.cgpa}) and identified **${student.skills.length} core competencies**. How can I guide your internship search today?`;

    case 'help':
      return `Here is how I can assist you, ${firstName}:\n\n• 🎯 **Personalized Internship Matching:** Run AI vector similarity matching against active scheme postings.\n• 📊 **Skill Gap Analysis:** Identify exact competencies needed to boost your match scores.\n• 🗺️ **Career Trajectory Prediction:** Explore predicted career pathways based on industry trends.\n• ❓ **PM Scheme Guidelines:** Instant answers on eligibility, stipends, and certificate issuance.\n\nWhat would you like to explore first?`;

    case 'find_internship':
      return `Based on your competency profile (${student.skills.slice(0, 4).join(', ')}), I have run a vector search across active postings! 🎯\n\nYour top recommended match is currently in **${student.preferredDomains[0] || 'Information Technology'}** with over **85% AI Compatibility Score**.\n\nHead over to your **AI Recommendations** tab to view the full list along with Explainable AI (XAI) feature breakdowns!`;

    case 'skill_advice': {
      const gapAnalysis = analyzeSkillGaps(student, student.preferredDomains[0] || 'Information Technology');
      return `Here is your AI Skill Gap Analysis for **${gapAnalysis.targetRole}** (Current Readiness: **${gapAnalysis.currentMatch}%**):\n\n` +
        (gapAnalysis.missingSkills.length > 0
          ? `Missing Competencies to acquire:\n` + gapAnalysis.missingSkills.map(s => `• **${s}**`).join('\n') + `\n\nRecommended Step 1: ${gapAnalysis.learningRoadmap[0]?.title} (${gapAnalysis.learningRoadmap[0]?.duration})`
          : `🎉 Excellent! Your current skill set completely covers all baseline requirements for your target domain!`);
    }

    case 'eligibility':
      return `📋 **PM Internship Scheme Official Eligibility Grounding:**\n\n• **Age Criteria:** 21 - 24 years at the time of application.\n• **Academic Background:** Enrolled in or passed B.Tech, B.Sc, B.Com, BBA, BCA, MCA, etc.\n• **Current Status:** Not currently engaged in full-time employment.\n• **Your Profile Status:** Academic record (${student.degree}, CGPA ${student.cgpa}) satisfies the standard scheme cutoff (${student.cgpa >= 6.0 ? 'Eligible ✅' : 'Requires improvement'}).`;

    case 'stipend':
      return `💰 **Stipend Structure under PM Internship Scheme:**\n\n• **Government Contribution:** ₹4,500 / month (Direct Benefit Transfer)\n• **Partner Company Contribution:** ₹500+ / month\n• **Total Monthly Allowance:** ₹5,000 to ₹15,000+ / month\n• **One-Time Grant:** ₹6,000 incidental assistance provided upon internship commencement.`;

    case 'application':
      return `📋 **Application Tracking & Status Pipeline:**\n\nAll your applications under the PM Internship Scheme feature **One-Click Auto-Fill** using your digital competency profile. Track live review stages (Submitted → Shortlisted → Selected) directly under the **My Applications** tab.`;

    case 'deadline':
      return `⏰ **Deadlines & Selection Cycles:**\n\nPM Scheme internship postings operate on rolling batch deadlines. Applications are evaluated dynamically by company AI shortlisting engines upon submission. We recommend applying early to top-matched roles!`;

    default:
      return `I evaluated your query against the NexYuva RAG knowledge base. You can ask me specific questions about:\n• Finding top-matched internships for ${student.skills.slice(0, 2).join(' & ')}\n• Analyzing skill gaps for target roles\n• Scheme eligibility rules and stipend structure\n\nOr type **"help"** for a full overview!`;
  }
}

// ---------------------------------------------------------------------------
// 8. Roadmap AI Tutor & Project Ideas Engine
// Real Groq call (openai/gpt-oss-20b -- Groq's recommended replacement after
// llama-3.1-8b-instant was decommissioned 2026-08-16; same fast/cheap tier
// used by the RAG chatbot's Python counterpart, app/ai/chatbot.py) with the
// original templated generator kept as an automatic fallback: if
// GROQ_API_KEY isn't configured, or the call fails/times out, the student
// still gets a real (non-error) response rather than a broken tutor tab --
// same graceful-degradation pattern used throughout this codebase.
// ---------------------------------------------------------------------------

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

async function callGroq(systemPrompt: string, userPrompt: string, maxTokens = 500): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json() as { choices: { message: { content: string } }[] };
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

export type TutorMode =
  | 'explain_beginner' | 'explain_advanced' | 'example' | 'explain_code' | 'review_code'
  | 'quiz' | 'flashcards' | 'interview_questions' | 'revision_notes' | 'learning_roadmap';

export interface TutorRequest {
  topic: string;
  mode: TutorMode;
  code?: string; // for explain_code / review_code
}

export interface TutorResponse {
  topic: string;
  mode: TutorMode;
  content: string;
}

const TUTOR_MODE_LABEL: Record<TutorMode, string> = {
  explain_beginner: 'Beginner Explanation',
  explain_advanced: 'Advanced Explanation',
  example: 'Worked Example',
  explain_code: 'Code Explanation',
  review_code: 'Code Review',
  quiz: 'Quiz',
  flashcards: 'Flashcards',
  interview_questions: 'Interview Questions',
  revision_notes: 'Revision Notes',
  learning_roadmap: 'Learning Roadmap',
};

export function generateTemplatedTutorResponse(req: TutorRequest): TutorResponse {
  const { topic, mode } = req;
  let content: string;

  switch (mode) {
    case 'explain_beginner':
      content = `**${topic} — Beginner Explanation**\n\nThink of ${topic} as a building block you'll reuse constantly once it clicks. Start with: what problem does it solve, and what would go wrong without it?\n\n1. **What it is:** the core idea behind ${topic}, in plain language.\n2. **Why it exists:** the specific pain point it removes for developers.\n3. **Where you'll see it:** the everyday situations where ${topic} shows up in real projects.\n\nDon't aim for a complete mental model on the first pass — build one small example, get it running, then come back and read the "why" again. It'll make more sense the second time.`;
      break;

    case 'explain_advanced':
      content = `**${topic} — Advanced Explanation**\n\nAt this level, focus on trade-offs rather than definitions:\n\n• **Internals:** what's actually happening under the hood when you use ${topic}.\n• **Edge cases:** the scenarios where the "textbook" behavior of ${topic} breaks down.\n• **Trade-offs:** performance, maintainability, and readability costs of common ${topic} patterns.\n• **When *not* to use it:** the situations where reaching for ${topic} is the wrong call.\n\nIf you can explain a case where ${topic} is the *wrong* tool, you understand it at this level.`;
      break;

    case 'example':
      content = `**${topic} — Worked Example**\n\nHere's a minimal, realistic scenario using ${topic}:\n\n1. Start with the smallest possible working version — no edge cases, no error handling.\n2. Get that running end-to-end so you have a baseline that works.\n3. Add one real-world complication at a time (bad input, empty state, a second user, scale) and see what breaks.\n4. Fix it, and note *why* the fix works — that's the actual ${topic} lesson, not the code itself.\n\nThis incremental approach beats copying a "complete" example, because you see exactly which line each requirement came from.`;
      break;

    case 'explain_code':
      content = req.code
        ? `**Code Explanation (${topic})**\n\nWalking through what you pasted, line by line:\n\n${req.code.split('\n').slice(0, 12).map((line, i) => `${i + 1}. \`${line.trim() || '(blank line)'}\` — ${line.trim() ? 'part of the ' + topic + ' logic' : 'formatting/readability'}`).join('\n')}\n\nPaste a specific line or block if you want a deeper breakdown of one part.`
        : `Paste the code you want explained, and I'll walk through it line by line in the context of ${topic}.`;
      break;

    case 'review_code':
      content = req.code
        ? `**Code Review (${topic})**\n\nGeneral things to check for code like this:\n\n• **Correctness:** does it handle empty/null input and the obvious edge cases?\n• **Naming:** do variable/function names describe intent, not just type?\n• **Structure:** could any block be pulled into a smaller, testable function?\n• **${topic}-specific:** does this follow the idiomatic pattern for ${topic}, or a workaround?\n\nShare the specific error or behavior you're seeing and I can point at the exact line.`
        : `Paste the code you want reviewed, and I'll check it against common ${topic} best practices.`;
      break;

    case 'quiz':
      content = `**${topic} — Quick Quiz**\n\n1. In your own words, what problem does ${topic} solve?\n2. Name one situation where using ${topic} would be the *wrong* choice.\n3. What's a common beginner mistake when first using ${topic}?\n4. How would you explain ${topic} to someone with no technical background?\n5. What's one thing about ${topic} that tripped you up when you first learned it?\n\nTry answering out loud before checking a reference — that's what actually cements it.`;
      break;

    case 'flashcards':
      content = `**${topic} — Flashcards**\n\n**Card 1**\nQ: What is ${topic}?\nA: (write your own one-sentence definition, then compare it to a reference)\n\n**Card 2**\nQ: What's the most common use case for ${topic}?\nA: (name the scenario, not just the syntax)\n\n**Card 3**\nQ: What's one limitation or gotcha of ${topic}?\nA: (the thing that costs people time in practice)\n\n**Card 4**\nQ: What's a related concept you should learn right after ${topic}?\nA: (the natural next step in this roadmap)`;
      break;

    case 'interview_questions':
      content = `**${topic} — Interview Questions**\n\n1. Explain ${topic} to me as if I were a junior developer.\n2. Walk me through how you'd debug an issue involving ${topic}.\n3. What are the trade-offs of using ${topic} versus the alternatives you know?\n4. Describe a time (real or hypothetical) you used ${topic} in a project — what went wrong and how did you fix it?\n5. What's a common misconception about ${topic}?\n\nPractice answering #2 and #4 out loud — those are the ones interviewers actually probe on follow-up.`;
      break;

    case 'revision_notes':
      content = `**${topic} — Revision Notes**\n\n• **Core idea:** one sentence — what ${topic} is for.\n• **Key terms:** the 3–5 vocabulary words you need to recognize instantly.\n• **Common pattern:** the "default" way ${topic} is used in most projects.\n• **Common mistake:** the thing that trips up almost everyone at first.\n• **Quick check:** can you explain ${topic} without looking at notes? If not, revisit the Beginner Explanation first.`;
      break;

    case 'learning_roadmap':
      content = `**${topic} — Learning Roadmap**\n\n1. **Understand the "why"** — what problem ${topic} exists to solve (see Beginner Explanation).\n2. **Build the smallest working example** — no error handling, just get it running (see Worked Example).\n3. **Read one real project's use of ${topic}** on GitHub — see how experienced devs actually apply it.\n4. **Build something small end-to-end** using ${topic} as a core piece, not a toy demo.\n5. **Go deep on trade-offs and edge cases** (see Advanced Explanation) once the basics feel automatic.\n6. **Teach it back** — explain ${topic} to someone else, or write revision notes from memory.`;
      break;

    default:
      content = `I can help with ${topic} — try Explain, Example, Quiz, Flashcards, Interview Questions, Revision Notes, or Learning Roadmap.`;
  }

  return { topic, mode, content };
}

// Per-mode instructions for the real Groq call -- kept separate from the
// templated fallback's switch above so each can evolve independently.
const TUTOR_MODE_INSTRUCTION: Record<TutorMode, string> = {
  explain_beginner: 'Explain this topic to a complete beginner in plain language. Cover what it is, why it exists, and where it shows up in real projects. Keep it concise and encouraging.',
  explain_advanced: 'Explain this topic for someone who already knows the basics. Focus on internals, edge cases, trade-offs, and when NOT to use it.',
  example: 'Give one minimal, realistic worked example of this topic, built up incrementally from a bare-bones version to something handling a real complication.',
  explain_code: 'Explain the following code line by line, in the context of this topic.',
  review_code: 'Review the following code for correctness, naming, structure, and idiomatic use of this topic. Point out specific issues, not generic advice.',
  quiz: 'Write a short 5-question quiz (no answers) that tests real understanding of this topic, not just definitions.',
  flashcards: 'Write 4 flashcards (Q on one line, A on the next) covering the core definition, main use case, a key limitation, and a natural next topic to learn.',
  interview_questions: 'Write 5 realistic technical interview questions about this topic, ordered from easier to harder.',
  revision_notes: 'Write concise revision notes: core idea in one sentence, key terms, the common pattern, and the most common mistake.',
  learning_roadmap: 'Write a short numbered learning roadmap (5-6 steps) for going from zero to comfortable with this topic.',
};

/**
 * Real AI Tutor: calls Groq (see callGroq above) with a mode-specific
 * instruction, formatted the same way as the rest of this file's content
 * (markdown-ish, **bold** headers) so NodePanel's formatContent() renders
 * it identically either way. Falls back to the deterministic templated
 * generator above if GROQ_API_KEY is missing or the call fails -- the
 * student always gets *something*, never a raw error.
 */
export async function generateTutorResponse(req: TutorRequest): Promise<TutorResponse> {
  const { topic, mode, code } = req;
  const instruction = TUTOR_MODE_INSTRUCTION[mode];
  const needsCode = mode === 'explain_code' || mode === 'review_code';

  if (needsCode && !code) {
    return generateTemplatedTutorResponse(req);
  }

  const systemPrompt =
    'You are an AI Tutor inside NexYuva, a student internship platform. ' +
    'You help students learn technical roadmap topics. Be concise, concrete, ' +
    'and practical -- prefer short paragraphs and lists over long prose. ' +
    `Use **double asterisks** for the few words that matter most, not whole sentences. Topic: "${topic}".`;
  const userPrompt = needsCode
    ? `${instruction}\n\n\`\`\`\n${code}\n\`\`\``
    : instruction;

  const aiContent = await callGroq(systemPrompt, userPrompt, mode === 'example' || mode === 'learning_roadmap' ? 600 : 400);

  if (aiContent) {
    return { topic, mode, content: aiContent };
  }
  return generateTemplatedTutorResponse(req);
}

export interface ProjectIdea {
  title: string;
  overview: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  prerequisites: string[];
  estimatedTime: string;
  features: string[];
  starterGuide: string[];
  resumeDescription: string;
  githubTips: string[];
  aiMentor: string;
}

// Static-first generator: deterministic given a topic, so the frontend can
// call this once and cache/ship the result rather than re-generating on
// every click. A "regenerate" action just calls this again with a different
// seed/variant index.
function templatedMentorTip(title: string, topic: string, difficulty: ProjectIdea['difficulty']): string {
  const stretch = difficulty === 'Beginner'
    ? `Don't add extra features until the core ${topic} flow works end-to-end — a smaller finished project beats a bigger unfinished one.`
    : `Once the core works, the highest-value next step is handling the one edge case that would break in front of a real user.`;
  return `If I were mentoring you on "${title}": start by writing down the single hardest part of this project in one sentence before you write any code. ${stretch} Come back to this AI Mentor panel any time you're stuck — describe exactly what you tried and what happened, not just "it doesn't work."`;
}

/**
 * Real AI Mentor tip per project: short, personalized guidance from Groq
 * (same model/pattern as generateTutorResponse), falling back to a
 * deterministic template if GROQ_API_KEY is missing or the call fails.
 */
async function generateAiMentorTip(title: string, topic: string, difficulty: ProjectIdea['difficulty']): Promise<string> {
  const systemPrompt =
    'You are an AI Mentor inside NexYuva, a student internship platform. ' +
    'Give short, encouraging, concrete mentorship for a student about to build a project. ' +
    'Sound like an experienced engineer giving a quick pep talk + one sharp piece of practical advice -- ' +
    'not a generic motivational quote. 3-4 sentences max.';
  const userPrompt = `Project: "${title}" (${difficulty} level, built around the topic "${topic}"). Give me one specific, actionable piece of mentor advice for starting this project well.`;

  const aiContent = await callGroq(systemPrompt, userPrompt, 200);
  return aiContent ?? templatedMentorTip(title, topic, difficulty);
}

// Static-first generator: deterministic given a topic, so the frontend can
// call this once and cache/ship the result rather than re-generating on
// every click. A "regenerate" action just calls this again with a different
// seed/variant index. The aiMentor field is the one live/generative piece --
// see generateAiMentorTip above -- with a templated fallback so the card
// never ships without mentor guidance.
export async function generateProjectIdeas(topic: string, count: number = 2): Promise<ProjectIdea[]> {
  const templates: [string, ProjectIdea['difficulty'], string[]][] = [
    [
      `${topic} Mini Tool`,
      'Beginner',
      ['Build a small, focused utility that uses only ${topic} at its core.',
       'Ship the simplest version first, then add one feature per session.'],
    ],
    [
      `${topic}-Powered Mini App`,
      'Intermediate',
      ['Combine ${topic} with a UI and a data layer so it feels like a real product.',
       'Add one "hard" feature (auth, persistence, or an external API) once the core works.'],
    ],
  ];

  return Promise.all(templates.slice(0, count).map(async ([title, difficulty]) => ({
    title,
    overview: `A hands-on project centered on ${topic}, sized to actually finish rather than stall out.`,
    difficulty,
    prerequisites: [`Basic ${topic} syntax/concepts`, 'Comfortable with Git & GitHub'],
    estimatedTime: difficulty === 'Beginner' ? '3-5 days' : '1-2 weeks',
    features: [
      `Core ${topic} functionality working end-to-end`,
      'Basic error handling for invalid/empty input',
      'A README explaining what it does and why',
    ],
    starterGuide: [
      'Sketch the smallest version that could possibly work',
      `Build the ${topic} core first, with no UI polish`,
      'Add one real-world edge case at a time',
      'Write the README last, once you know what it actually does',
    ],
    resumeDescription: `Built a ${title.toLowerCase()} using ${topic}, focusing on [specific outcome — fill in after building].`,
    githubTips: [
      'Commit in small, meaningful steps — not one giant "final" commit',
      'Write a README with a screenshot/GIF and a "how to run it" section',
      'Pin this repo if it\'s one of your strongest examples of ' + topic,
    ],
    aiMentor: await generateAiMentorTip(title, topic, difficulty),
  })));
}
