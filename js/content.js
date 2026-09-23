/*
  ─────────────────────────────────────────────────────────────
  ALL PORTFOLIO TEXT LIVES HERE.
  Change any text below, save, then git push. Both the 3D room
  and the Quick view page read from this one file.
  ─────────────────────────────────────────────────────────────
*/
export const CONTENT = {
  name: 'Fatima Arif',
  callsign: 'FA-01',
  role: 'AI Systems Builder',
  tagline: 'Launching intelligent systems with AI',
  location: 'Karachi, Pakistan',
  groundStation: { name: 'KARACHI', lat: 24.86, lon: 67.0 },
  focus: 'Multi-agent systems · LLM apps · Machine learning',

  about: [
    'I build AI systems that do real work: multi-agent pipelines, LLM apps and web products people actually use.',
    'My main project, Veralyze, uses a team of AI agents to check YouTube videos and give a 0–100 trust score in about 18 seconds.',
    'If I weren’t a developer, I’d be an astronaut. So I built my portfolio as a mission control room.',
  ],

  projects: [
    {
      id: 'veralyze',
      name: 'Veralyze',
      kind: 'AI video trust checker',
      status: 'LIVE',
      year: '2026',
      summary: 'Paste a YouTube link and get a trust score (0–100) in about 18 seconds.',
      points: [
        'A multi-agent pipeline reads the transcript and pulls out the factual claims.',
        'Agents check each claim against independent web sources and flag manipulation tricks.',
        'Two modes: manipulation analysis and full source verification, with shareable public reports.',
      ],
      stack: ['React', 'Vite', 'Tailwind', 'Supabase', 'n8n', 'Claude API', 'Tavily', 'Vercel'],
      image: '/assets/projects/veralyze.webp',
      links: [{ label: 'Visit veralyze.net', href: 'https://veralyze.net' }],
    },
    {
      id: 'quizlock',
      name: 'QuizLock',
      kind: 'Proctored exam portal',
      status: 'LIVE',
      year: '2026',
      summary: 'Online exams that stay fair: locked full-screen mode with camera and screen recording.',
      points: [
        'Every student gets a unique set of questions from the teacher’s pool.',
        'Tab switching, copy-paste and leaving full screen are blocked and logged.',
        'Live results dashboard, recording playback and manual grading for teachers.',
      ],
      stack: ['React', 'Vite', 'Tailwind', 'Supabase', 'Postgres RLS', 'Edge Functions', 'Resend', 'Monaco'],
      image: null,
      links: [],
    },
    {
      id: 'graze-rider',
      name: 'Graze Rider',
      kind: 'Neon arcade racer',
      status: 'PLAYABLE',
      year: '2026',
      summary: 'Skim the traffic at high speed. The closer you pass, the more coins you earn.',
      points: [
        'Lane-switching with swipe or arrow keys, missions and a garage.',
        'Built as one lightweight HTML5 Canvas file that runs on phone and desktop.',
      ],
      stack: ['JavaScript', 'HTML5 Canvas', 'Web Audio'],
      image: '/assets/projects/graze-rider.webp',
      play: '/games/graze-rider',
      links: [],
    },
    {
      id: 'merge-garden',
      name: 'Merge Garden Bloom',
      kind: 'Merge puzzle game',
      status: 'PLAYABLE',
      year: '2026',
      summary: 'Drag two matching plants together to grow a better one, then fill the orders.',
      points: [
        'Drag and drop that works with mouse and touch.',
        'Saves your garden progress between visits.',
      ],
      stack: ['JavaScript', 'Drag & drop', 'Touch input'],
      image: '/assets/projects/merge-garden.webp',
      play: '/games/merge-garden',
      links: [],
    },
  ],

  experience: [
    {
      role: 'Founder & Builder',
      org: 'Veralyze',
      dates: '2026 – Present',
      points: [
        'Designed and shipped an AI product end to end: agent pipeline, web app, landing site and Chrome extension.',
      ],
    },
    {
      role: 'AI/ML Engineering Intern',
      org: 'DevelopersHub Corporation',
      dates: 'Mar – Apr 2026',
      points: [
        'Explored and visualised the Iris dataset with pandas and seaborn.',
        'Predicted stock closing prices with Linear Regression on market data.',
        'Built a heart-disease risk model with Logistic Regression (scikit-learn), handling missing data and checking results with a confusion matrix.',
      ],
    },
  ],

  education: [
    { school: 'Karachi Institute of Economics & Technology (KIET)', detail: 'Computer Science student' },
  ],

  skills: [
    { group: 'AI & LLM', items: ['Multi-agent pipelines', 'Claude API', 'Prompt design', 'n8n automation', 'Tavily search'] },
    { group: 'ML & Data', items: ['Python', 'pandas', 'scikit-learn', 'matplotlib / seaborn'] },
    { group: 'Web', items: ['React', 'Vite', 'Tailwind', 'JavaScript', 'Canvas games'] },
    { group: 'Cloud', items: ['Supabase', 'Postgres', 'Vercel', 'Git / GitHub'] },
  ],

  contact: [
    { label: 'Email', value: 'fatimaarif.creates@gmail.com', href: 'mailto:fatimaarif.creates@gmail.com' },
    { label: 'LinkedIn', value: 'linkedin.com/in/fatima-arif-a09a61317', href: 'https://www.linkedin.com/in/fatima-arif-a09a61317' },
    { label: 'GitHub', value: 'github.com/FatimaArif30', href: 'https://github.com/FatimaArif30' },
    { label: 'Veralyze', value: 'veralyze.net', href: 'https://veralyze.net' },
  ],
};
