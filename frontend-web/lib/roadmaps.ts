export interface RoadmapTopic { title: string; note: string; dependsOn?: string[]; }
export interface RoadmapStage { stage: string; topics: RoadmapTopic[]; }
export interface Roadmap { id: string; title: string; blurb: string; stages: RoadmapStage[]; }

export const ROADMAPS: Roadmap[] = [
  {
    id: 'frontend', title: 'Frontend Developer',
    blurb: 'Build the visual, interactive parts of the web that users see and touch.',
    stages: [
      { stage: 'Foundations', topics: [
        { title: 'How the Web Works', note: 'Clients, servers, HTTP/HTTPS, DNS, hosting - what actually happens when a URL loads' },
        { title: 'HTML', note: 'Semantic markup, forms, accessibility basics' },
        { title: 'CSS', note: 'Box model, flexbox, grid, responsive design' },
        { title: 'JavaScript', note: 'Syntax, DOM manipulation, async/await, fetch' },
        { title: 'Git & GitHub', note: 'Version control, branches, pull requests' },
      ]},
      { stage: 'Core Skills', topics: [
        { title: 'Responsive & Accessible UI', note: 'Media queries, mobile-first design, ARIA basics, keyboard navigation' },
        { title: 'A Framework', note: 'React, Vue, or Svelte - components, props, state - pick one and go deep', dependsOn: ['JavaScript'] },
        { title: 'Package Managers', note: 'npm, yarn, or pnpm', dependsOn: ['A Framework'] },
        { title: 'Build Tools', note: 'Vite, Webpack, or Turbopack', dependsOn: ['A Framework'] },
        { title: 'TypeScript', note: 'Static typing for safer, more maintainable code', dependsOn: ['A Framework'] },
        { title: 'CSS Frameworks', note: 'Tailwind CSS or styled-components', dependsOn: ['A Framework'] },
      ]},
      { stage: 'Intermediate', topics: [
        { title: 'State Management', note: 'Context API, Zustand, Redux, or Pinia' },
        { title: 'Routing', note: 'Client-side and server-side routing patterns' },
        { title: 'Testing', note: 'Jest, Vitest, React Testing Library, Playwright' },
        { title: 'Browser DevTools', note: 'Network tab, performance profiling, debugging, source maps' },
        { title: 'Working with APIs', note: 'REST conventions, error handling, loading/empty states, pagination' },
      ]},
      { stage: 'Advanced', topics: [
        { title: 'Web Performance', note: 'Lazy loading, code splitting, Core Web Vitals, caching strategies' },
        { title: 'Accessibility (a11y)', note: 'Screen readers, ARIA roles, color contrast, focus management' },
        { title: 'Frontend Security', note: 'XSS, CSRF, CORS, content security policy basics' },
        { title: 'Authentication in the Browser', note: 'OAuth flows, JWT storage tradeoffs, session handling' },
        { title: 'GraphQL Clients', note: 'Apollo, urql - consuming GraphQL APIs', dependsOn: ['Working with APIs'] },
      ]},
      { stage: 'Specialization', topics: [
        { title: 'SSR & SSG', note: 'Next.js, Nuxt, Remix - rendering strategies and when to use each' },
        { title: 'PWAs', note: 'Service workers, offline support, installability' },
        { title: 'Design Systems', note: 'Component libraries, design tokens, Storybook' },
        { title: 'CI/CD & Deployment', note: 'GitHub Actions, Vercel/Netlify, environment configs' },
        { title: 'Portfolio & Interview Prep', note: 'Real projects, system design basics for frontend, mock interviews' },
      ]},
    ],
  },
  {
    id: 'backend', title: 'Backend Developer',
    blurb: 'Build the servers, APIs, and databases that power applications behind the scenes.',
    stages: [
      { stage: 'Foundations', topics: [
        { title: 'A Language', note: 'Python, Node.js/JavaScript, Java, or Go' },
        { title: 'Data Structures & Algorithms', note: 'Arrays, trees, graphs, big-O thinking' },
        { title: 'Version Control', note: 'Git workflows, branching strategies' },
        { title: 'OS & Networking Basics', note: 'Processes, TCP/IP, DNS, HTTP' },
      ]},
      { stage: 'Core Skills', topics: [
        { title: 'A Web Framework', note: 'FastAPI, Express, Spring Boot, or Django', dependsOn: ['A Language'] },
        { title: 'REST API Design', note: 'Resource modeling, status codes, versioning', dependsOn: ['A Web Framework'] },
        { title: 'Relational Databases', note: 'PostgreSQL/MySQL, schema design, SQL', dependsOn: ['A Web Framework'] },
        { title: 'ORMs', note: 'SQLAlchemy, Prisma, Hibernate', dependsOn: ['Relational Databases'] },
        { title: 'Authentication', note: 'JWT, OAuth2, session management', dependsOn: ['A Web Framework'] },
      ]},
      { stage: 'Intermediate', topics: [
        { title: 'Caching', note: 'Redis, in-memory caching strategies' },
        { title: 'Message Queues', note: 'RabbitMQ, Kafka - async processing' },
        { title: 'NoSQL Databases', note: 'MongoDB, DynamoDB - when and why' },
        { title: 'API Testing', note: 'Unit, integration, and contract tests' },
        { title: 'Containerization', note: 'Docker basics, images, volumes' },
      ]},
      { stage: 'Advanced / Specialization', topics: [
        { title: 'Microservices', note: 'Service boundaries, communication patterns' },
        { title: 'GraphQL APIs', note: 'Schema design, resolvers', dependsOn: ['REST API Design'] },
        { title: 'System Design', note: 'Scalability, load balancing, CAP theorem' },
        { title: 'Observability', note: 'Logging, metrics, distributed tracing' },
      ]},
    ],
  },
  {
    id: 'fullstack', title: 'Full Stack Developer',
    blurb: 'Work across the entire stack - frontend, backend, and everything connecting them.',
    stages: [
      { stage: 'Foundations', topics: [
        { title: 'HTML/CSS/JS', note: 'The universal building blocks' },
        { title: 'A Backend Language', note: 'Node.js, Python, or Java' },
        { title: 'Git & GitHub', note: 'Collaboration workflows' },
        { title: 'Databases 101', note: 'SQL fundamentals' },
      ]},
      { stage: 'Core Skills', topics: [
        { title: 'A Frontend Framework', note: 'React or Vue', dependsOn: ['HTML/CSS/JS'] },
        { title: 'A Backend Framework', note: 'Express, FastAPI, or NestJS', dependsOn: ['A Backend Language'] },
        { title: 'REST APIs', note: 'Building and consuming them', dependsOn: ['A Backend Framework'] },
        { title: 'Authentication', note: 'End-to-end login flows', dependsOn: ['REST APIs', 'A Frontend Framework'] },
      ]},
      { stage: 'Intermediate', topics: [
        { title: 'Full-Stack Frameworks', note: 'Next.js, Nuxt - unified frontend/backend', dependsOn: ['A Frontend Framework', 'A Backend Framework'] },
        { title: 'Deployment', note: 'Vercel, Railway, or a VPS' },
        { title: 'Testing Across the Stack', note: 'E2E tests with Playwright/Cypress' },
        { title: 'CI/CD Basics', note: 'GitHub Actions pipelines' },
      ]},
      { stage: 'Advanced / Specialization', topics: [
        { title: 'Cloud Platforms', note: 'AWS, GCP, or Azure fundamentals' },
        { title: 'Real-time Features', note: 'WebSockets, Server-Sent Events' },
        { title: 'Monorepos', note: 'Turborepo, Nx for multi-app projects' },
      ]},
    ],
  },
  {
    id: 'data-ai', title: 'Data Analyst',
    blurb: 'Turn raw data into insights that drive real business decisions.',
    stages: [
      { stage: 'Foundations', topics: [
        { title: 'Excel/Google Sheets', note: 'Pivot tables, formulas, basic modeling' },
        { title: 'SQL', note: 'Joins, aggregations, window functions' },
        { title: 'Statistics Basics', note: 'Mean, median, distributions, correlation' },
      ]},
      { stage: 'Core Skills', topics: [
        { title: 'Python or R', note: 'pandas/numpy or tidyverse for data wrangling', dependsOn: ['SQL', 'Statistics Basics'] },
        { title: 'Data Visualization', note: 'Matplotlib, Seaborn, or Tableau/Power BI', dependsOn: ['Python or R'] },
        { title: 'Data Cleaning', note: 'Handling missing values, outliers, duplicates', dependsOn: ['Python or R'] },
      ]},
      { stage: 'Intermediate', topics: [
        { title: 'A/B Testing', note: 'Hypothesis testing, significance', dependsOn: ['Statistics Basics'] },
        { title: 'Dashboarding Tools', note: 'Power BI, Tableau, Looker' },
        { title: 'ETL Basics', note: 'Extract-transform-load pipelines' },
      ]},
      { stage: 'Advanced / Specialization', topics: [
        { title: 'Intro to Machine Learning', note: 'Regression, classification basics' },
        { title: 'Big Data Tools', note: 'Spark, BigQuery for large datasets' },
        { title: 'Storytelling with Data', note: 'Communicating insights to stakeholders' },
      ]},
    ],
  },
  {
    id: 'devops', title: 'DevOps / Cloud Engineer',
    blurb: 'Automate, deploy, and keep infrastructure running reliably at scale.',
    stages: [
      { stage: 'Foundations', topics: [
        { title: 'Linux Basics', note: 'Shell, file systems, permissions' },
        { title: 'Networking', note: 'DNS, load balancers, firewalls' },
        { title: 'Git', note: 'Branching strategies for team workflows' },
        { title: 'A Scripting Language', note: 'Bash or Python for automation' },
      ]},
      { stage: 'Core Skills', topics: [
        { title: 'Docker', note: 'Images, containers, Dockerfiles', dependsOn: ['A Scripting Language'] },
        { title: 'CI/CD', note: 'GitHub Actions, Jenkins, or GitLab CI', dependsOn: ['Docker'] },
        { title: 'Cloud Fundamentals', note: 'AWS, Azure, or GCP core services', dependsOn: ['Docker'] },
        { title: 'Infrastructure as Code', note: 'Terraform basics', dependsOn: ['Cloud Fundamentals'] },
      ]},
      { stage: 'Intermediate', topics: [
        { title: 'Kubernetes', note: 'Pods, deployments, services, scaling', dependsOn: ['Docker', 'Cloud Fundamentals'] },
        { title: 'Monitoring', note: 'Prometheus, Grafana, alerting' },
        { title: 'Configuration Management', note: 'Ansible' },
        { title: 'Secrets Management', note: 'Vault, cloud KMS' },
      ]},
      { stage: 'Advanced / Specialization', topics: [
        { title: 'Service Mesh', note: 'Istio, Linkerd for microservice networking' },
        { title: 'Site Reliability Engineering', note: 'SLOs, error budgets, incident response' },
        { title: 'Multi-Cloud Strategy', note: 'Cost, redundancy, vendor lock-in tradeoffs' },
      ]},
    ],
  },
  {
    id: 'cybersecurity', title: 'Cybersecurity Analyst',
    blurb: 'Protect systems, networks, and data from attackers.',
    stages: [
      { stage: 'Foundations', topics: [
        { title: 'Networking Fundamentals', note: 'TCP/IP, ports, protocols' },
        { title: 'Operating Systems', note: 'Linux and Windows internals' },
        { title: 'Security Basics', note: 'CIA triad, common threat models' },
      ]},
      { stage: 'Core Skills', topics: [
        { title: 'Network Security', note: 'Firewalls, VPNs, IDS/IPS', dependsOn: ['Networking Fundamentals'] },
        { title: 'Web App Security', note: 'OWASP Top 10, common vulnerabilities', dependsOn: ['Network Security'] },
        { title: 'Cryptography Basics', note: 'Hashing, encryption, certificates', dependsOn: ['Security Basics'] },
      ]},
      { stage: 'Intermediate', topics: [
        { title: 'Penetration Testing', note: 'Reconnaissance, scanning, reporting', dependsOn: ['Network Security', 'Web App Security'] },
        { title: 'SIEM Tools', note: 'Splunk, ELK for log analysis' },
        { title: 'Incident Response', note: 'Detection, containment, recovery' },
      ]},
      { stage: 'Advanced / Specialization', topics: [
        { title: 'Cloud Security', note: 'IAM, security groups, compliance' },
        { title: 'Malware Analysis', note: 'Static and dynamic analysis basics' },
        { title: 'Security Certifications', note: 'CompTIA Security+, CEH, OSCP paths' },
      ]},
    ],
  },
  {
    id: 'mobile', title: 'Mobile App Developer',
    blurb: 'Build apps people carry in their pocket, for Android, iOS, or both.',
    stages: [
      { stage: 'Foundations', topics: [
        { title: 'Kotlin or Swift', note: 'Native language for Android or iOS' },
        { title: 'Or: Dart / JavaScript', note: 'For cross-platform via Flutter or React Native' },
        { title: 'Git & GitHub', note: 'Version control basics' },
        { title: 'UI Fundamentals', note: 'Layouts, navigation, screen sizes' },
      ]},
      { stage: 'Core Skills', topics: [
        { title: 'A Framework', note: 'Jetpack Compose, SwiftUI, Flutter, or React Native' },
        { title: 'Local Storage', note: 'SharedPreferences, SQLite, Room, or AsyncStorage', dependsOn: ['A Framework'] },
        { title: 'REST APIs', note: 'Networking, JSON parsing, error handling', dependsOn: ['A Framework'] },
        { title: 'State Management', note: 'ViewModel, Provider, Redux, or Riverpod', dependsOn: ['A Framework'] },
      ]},
      { stage: 'Intermediate', topics: [
        { title: 'Firebase', note: 'Auth, Firestore, push notifications' },
        { title: 'Testing', note: 'Unit tests, UI tests, device farms' },
        { title: 'Performance', note: 'Memory profiling, list virtualization' },
        { title: 'Offline-First Design', note: 'Sync strategies, local caching', dependsOn: ['Local Storage', 'REST APIs'] },
      ]},
      { stage: 'Advanced / Specialization', topics: [
        { title: 'CI/CD for Mobile', note: 'Fastlane, App Center, GitHub Actions' },
        { title: 'App Store Publishing', note: 'Play Store & App Store review guidelines' },
        { title: 'Deep Linking', note: 'Universal links, app clips, widgets' },
      ]},
    ],
  },
  {
    id: 'uiux', title: 'UI/UX Designer',
    blurb: 'Design digital experiences that feel obvious in hindsight.',
    stages: [
      { stage: 'Foundations', topics: [
        { title: 'Design Principles', note: 'Contrast, alignment, hierarchy, whitespace' },
        { title: 'Color & Typography', note: 'Palettes, type scales, readability' },
        { title: 'Sketching', note: 'Low-fidelity ideation on paper or tablet' },
      ]},
      { stage: 'Core Skills', topics: [
        { title: 'Figma', note: 'Frames, components, auto layout, variants', dependsOn: ['Sketching'] },
        { title: 'Wireframing', note: 'Low-fidelity layout before visual design', dependsOn: ['Figma'] },
        { title: 'Prototyping', note: 'Clickable flows, transitions, micro-interactions', dependsOn: ['Wireframing'] },
      ]},
      { stage: 'Intermediate', topics: [
        { title: 'User Research', note: 'Interviews, surveys, competitive analysis' },
        { title: 'Usability Testing', note: 'Task-based testing, think-aloud sessions', dependsOn: ['Prototyping'] },
        { title: 'Personas & Journey Maps', note: 'Turning research into design direction', dependsOn: ['User Research'] },
      ]},
      { stage: 'Advanced / Specialization', topics: [
        { title: 'Design Systems', note: 'Tokens, component libraries, documentation' },
        { title: 'Interaction Design', note: 'Motion, states, feedback loops' },
        { title: 'Dev Handoff', note: 'Specs, redlines, working with engineers' },
      ]},
    ],
  },
  {
    id: 'cloud', title: 'Cloud Computing (AWS)',
    blurb: 'Design and run infrastructure that scales on demand.',
    stages: [
      { stage: 'Foundations', topics: [
        { title: 'Cloud Concepts', note: 'IaaS, PaaS, SaaS, shared responsibility model' },
        { title: 'Networking Basics', note: 'VPC, subnets, routing, DNS' },
        { title: 'Linux Fundamentals', note: 'Shell, permissions, processes' },
      ]},
      { stage: 'Core Skills', topics: [
        { title: 'EC2', note: 'Virtual machines, instance types, AMIs', dependsOn: ['Cloud Concepts', 'Networking Basics'] },
        { title: 'S3', note: 'Object storage, buckets, lifecycle policies', dependsOn: ['Cloud Concepts'] },
        { title: 'VPC', note: 'Isolated networks, security groups, NACLs', dependsOn: ['Networking Basics'] },
        { title: 'IAM', note: 'Users, roles, policies, least privilege', dependsOn: ['EC2'] },
      ]},
      { stage: 'Intermediate', topics: [
        { title: 'Lambda', note: 'Serverless functions, event triggers', dependsOn: ['EC2', 'IAM'] },
        { title: 'RDS', note: 'Managed relational databases, backups' },
        { title: 'Load Balancing', note: 'ALB/NLB, auto scaling groups', dependsOn: ['EC2', 'VPC'] },
      ]},
      { stage: 'Advanced / Specialization', topics: [
        { title: 'High Availability', note: 'Multi-AZ, failover, disaster recovery' },
        { title: 'Cost Optimization', note: 'Reserved instances, spot, right-sizing' },
        { title: 'AWS Certification', note: 'Cloud Practitioner or Solutions Architect Associate' },
      ]},
    ],
  },
];
