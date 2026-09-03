// Shared frontend types + static reference data.
// The actual AI computation logic (matching, resume parsing, career prediction,
// skill-gap analysis, chatbot) now lives in ../backend/src/aiEngine.ts.
// This file only keeps: (1) TypeScript shapes the UI needs, and (2) small static
// reference data (the master skill list) so things like autocomplete render
// instantly without a network round trip.

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
  eligibility: string | string[];
  cgpaCutoff?: number;
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
  avatarUrl?: string | null;
  college: string;
  city: string;
  degree: string;
  branch: string;
  year: number;
  cgpa: number;
  skills: string[];
  tools: string[];
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
