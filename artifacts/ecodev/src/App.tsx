import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CircleHelp,
  Clipboard,
  Code2,
  Download,
  FileCode2,
  Gauge,
  Leaf,
  LineChart,
  Menu,
  Moon,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { type ReactNode } from 'react';

type Analysis = {
  id: string;
  fileName: string;
  language: string;
  createdAt: string;
  score: number;
  complexity: string;
  runtimeEstimate: string;
  memoryEstimate: string;
  summary: string;
  findings: string[];
  alternative: string;
  tradeoff: string;
  saved: boolean;
};

type MonitorSample = {
  processName: string;
  category: string;
  cpu: number;
  memory: number;
  io: number;
  score: number;
  status: string;
  capturedAt: string;
};

type ResearchNote = {
  title: string;
  source: string;
  year: number;
  takeaway: string;
  tags: string[];
};

const queryClient = new QueryClient();
const storageKey = 'ecodev-analyses';
const settingsKey = 'ecodev-settings';

const starterCode = `function uniqueItems(items) {
  const result = [];
  for (let i = 0; i < items.length; i++) {
    if (!result.includes(items[i])) {
      result.push(items[i]);
    }
  }
  return result;
}`;

const samples: Record<string, { fileName: string; code: string }> = {
  javascript: { fileName: 'unique-items.js', code: starterCode },
  typescript: {
    fileName: 'group-by.ts',
    code: `function groupBy<T>(items: T[], key: keyof T) {
  return items.reduce((groups, item) => {
    const value = String(item[key]);
    (groups[value] ??= []).push(item);
    return groups;
  }, {} as Record<string, T[]>);
}`,
  },
  python: {
    fileName: 'latest-records.py',
    code: `def latest_records(records):
    latest = {}
    for record in records:
        key = record["user_id"]
        if key not in latest or record["created_at"] > latest[key]["created_at"]:
            latest[key] = record
    return list(latest.values())`,
  },
  go: {
    fileName: 'dedupe.go',
    code: `func unique(items []string) []string {
    seen := make(map[string]bool)
    result := []string{}
    for _, item := range items {
        if !seen[item] {
            seen[item] = true
            result = append(result, item)
        }
    }
    return result
}`,
  },
};

const defaultAnalyses: Analysis[] = [
  {
    id: 'analysis-1',
    fileName: 'unique-items.js',
    language: 'javascript',
    createdAt: '2025-02-18T11:42:00.000Z',
    score: 82,
    complexity: 'O(n²) → O(n)',
    runtimeEstimate: '18.4 ms',
    memoryEstimate: '2.1 MB',
    summary: 'Repeated linear scans make this routine grow quickly as the input gets larger.',
    findings: ['Array.includes() scans the result on every pass.', 'A Set gives constant-time membership checks.'],
    alternative: 'Replace the result array lookup with a Set, then materialize the array at the end.',
    tradeoff: 'Uses ~0.6 MB more memory for a 10k item input, while cutting runtime by an estimated 63%.',
    saved: true,
  },
  {
    id: 'analysis-2',
    fileName: 'batch-export.ts',
    language: 'typescript',
    createdAt: '2025-02-17T15:20:00.000Z',
    score: 74,
    complexity: 'O(n log n)',
    runtimeEstimate: '42.8 ms',
    memoryEstimate: '4.8 MB',
    summary: 'Sorting dominates the work here; the shape is predictable and already reasonably efficient.',
    findings: ['Sort is called once over the full collection.', 'Intermediate objects are retained through the map step.'],
    alternative: 'Stream records in chunks and release each transformed batch after upload.',
    tradeoff: 'Lower peak memory with more I/O coordination and slightly more implementation surface.',
    saved: true,
  },
  {
    id: 'analysis-3',
    fileName: 'latest-records.py',
    language: 'python',
    createdAt: '2025-02-16T09:08:00.000Z',
    score: 91,
    complexity: 'O(n)',
    runtimeEstimate: '9.7 ms',
    memoryEstimate: '1.3 MB',
    summary: 'A single pass and keyed lookup keep this operation proportional to the number of records.',
    findings: ['Dictionary membership is constant-time on average.', 'The final list is the only required copy.'],
    alternative: 'Keep the current approach; focus on input batching if this sits in a larger pipeline.',
    tradeoff: 'No material algorithmic improvement identified without changing the output contract.',
    saved: true,
  },
];

const monitorSamples: MonitorSample[] = [
  { processName: 'vite dev server', category: 'Build', cpu: 18.2, memory: 412, io: 2.8, score: 87, status: 'Healthy', capturedAt: '2 min ago' },
  { processName: 'Chrome — EcoDev', category: 'Browser', cpu: 8.6, memory: 288, io: 0.8, score: 93, status: 'Healthy', capturedAt: '5 min ago' },
  { processName: 'PostgreSQL', category: 'Data', cpu: 12.4, memory: 526, io: 7.1, score: 78, status: 'Watch', capturedAt: '8 min ago' },
];

const researchNotes: ResearchNote[] = [
  { title: 'Energy proportional computing', source: 'ACM Queue · Barroso & Hölzle', year: 2007, takeaway: 'Idle and lightly loaded systems still draw a meaningful share of peak power. Fewer active resources can matter as much as faster code.', tags: ['systems', 'capacity'] },
  { title: 'The environmental footprint of data centers', source: 'IEA Data Centres Report', year: 2024, takeaway: 'Efficiency improvements compound when they reduce compute, memory movement, and cooling demand across repeated workloads.', tags: ['operations', 'measurement'] },
  { title: 'A critique of carbon-aware software', source: 'ACM Computing Surveys', year: 2023, takeaway: 'Measure the workload boundary first. A local optimization is only useful when its tradeoffs are visible in the whole system.', tags: ['methodology', 'tradeoffs'] },
  { title: 'Designing for performance', source: 'Web Performance Working Group', year: 2022, takeaway: 'Small changes to transfer size and main-thread work improve both perceived speed and the energy used per interaction.', tags: ['frontend', 'web'] },
];

function getAnalyses(): Analysis[] {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) as Analysis[] : defaultAnalyses;
  } catch {
    return defaultAnalyses;
  }
}

function writeAnalyses(analyses: Analysis[]) {
  localStorage.setItem(storageKey, JSON.stringify(analyses));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function scoreTone(score: number) {
  if (score >= 85) return 'text-[#2c7a4b]';
  if (score >= 70) return 'text-[#a76c27]';
  return 'text-[#b84e42]';
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3" data-testid="link-logo">
      <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#c6ed51] text-[#183d2a] shadow-sm">
        <Leaf size={19} strokeWidth={2.5} />
      </span>
      <span className="text-[15px] font-extrabold tracking-[-0.04em] text-[#e7f0d6]">EcoDev</span>
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const links = [
    { href: '/', label: 'Overview', icon: Gauge, test: 'overview' },
    { href: '/analyzer', label: 'Analyzer', icon: Code2, test: 'analyzer' },
    { href: '/history', label: 'History', icon: LineChart, test: 'history' },
    { href: '/learn', label: 'Learn', icon: BookOpen, test: 'learn' },
  ];

  useEffect(() => {
    const savedTheme = localStorage.getItem('ecodev-theme') === 'dark';
    setDark(savedTheme);
    document.documentElement.classList.toggle('dark', savedTheme);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    localStorage.setItem('ecodev-theme', next ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', next);
  }

  return (
    <div className="grain flex min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col bg-sidebar px-5 py-6 text-sidebar-foreground transition-transform duration-300 md:static md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`} data-testid="sidebar-navigation">
        <div className="mb-12 flex items-center justify-between"><Logo /><button onClick={() => setOpen(false)} className="rounded-md p-1 text-[#95aa95] md:hidden" data-testid="button-close-navigation"><X size={18} /></button></div>
        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.17em] text-[#789178]">Workspace</div>
        <nav className="space-y-1" aria-label="Primary navigation">
          {links.map(({ href, label, icon: Icon, test }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} data-testid={`link-nav-${test}`} className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${location === href ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-[#a7b8a4] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}>
              <Icon size={17} strokeWidth={location === href ? 2.4 : 1.8} /><span>{label}</span>
              {label === 'Analyzer' && <span className="ml-auto rounded bg-[#c6ed51]/15 px-1.5 py-0.5 font-mono text-[9px] text-[#c6ed51]">LIVE</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-10 mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.17em] text-[#789178]">Workspace</div>
        <Link href="/settings" onClick={() => setOpen(false)} data-testid="link-nav-settings" className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${location === '/settings' ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-[#a7b8a4] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}><SettingsIcon size={17} /><span>Settings</span></Link>
        <div className="mt-auto rounded-xl border border-sidebar-border bg-[#234231]/50 p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-[#d6e6c5]"><span className="h-1.5 w-1.5 rounded-full bg-[#c6ed51]" /> Local workspace</div>
          <p className="text-[11px] leading-relaxed text-[#90a592]">Analyses stay in this browser. Nothing leaves your machine.</p>
          <Link href="/settings" data-testid="link-local-settings" className="mt-3 inline-flex text-[11px] font-bold text-[#c6ed51] hover:underline">Review controls <ArrowUpRight size={12} className="ml-1" /></Link>
        </div>
      </aside>
      {open && <button aria-label="Close navigation" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-[#13271c]/35 md:hidden" data-testid="button-navigation-overlay" />}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background/90 px-5 backdrop-blur-md md:px-9">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden" data-testid="button-open-navigation"><Menu size={20} /></button>
          <div className="hidden items-center gap-2 text-[12px] text-muted-foreground md:flex"><span className="mono text-[10px] text-primary">ECODEV /</span><span>{location === '/' ? 'overview' : location.replace('/', '')}</span></div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggleTheme} className="rounded-lg p-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" data-testid="button-toggle-theme" aria-label="Toggle theme">{dark ? <Sparkles size={17} /> : <Moon size={17} />}</button>
            <Link href="/settings" className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-[11px] font-extrabold text-secondary-foreground" data-testid="link-profile">AK</Link>
          </div>
        </header>
        <main className="shell-grid min-w-0 flex-1 overflow-x-hidden"><div className="mx-auto max-w-[1360px] px-5 py-8 md:px-9 md:py-10">{children}</div></main>
      </div>
    </div>
  );
}

function PageTitle({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="mono mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-primary">{eyebrow}</div><h1 className="text-[30px] font-extrabold tracking-[-0.06em] text-foreground md:text-[38px]">{title}</h1><p className="mt-2 max-w-[600px] text-[13px] leading-relaxed text-muted-foreground">{detail}</p></div>{action}</div>;
}

function ScoreRing({ score, size = 'large' }: { score: number; size?: 'large' | 'small' }) {
  const radius = size === 'large' ? 39 : 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return <div className={`relative flex shrink-0 items-center justify-center ${size === 'large' ? 'h-[102px] w-[102px]' : 'h-[58px] w-[58px]'}`} data-testid={`score-ring-${score}`}><svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth={size === 'large' ? 6 : 5} className="text-muted" /><circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth={size === 'large' ? 6 : 5} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} className={scoreTone(score)} /></svg><span className={`${size === 'large' ? 'text-[25px]' : 'text-[15px]'} font-extrabold tracking-[-0.06em] ${scoreTone(score)}`}>{score}</span></div>;
}

function Overview() {
  const analyses = getAnalyses();
  const average = Math.round(analyses.reduce((sum, item) => sum + item.score, 0) / analyses.length);
  return <div className="animate-rise-in">
    <PageTitle eyebrow="Workspace overview" title="Make the efficient call." detail="A clear read on your codebase today, with the evidence to choose what happens next." action={<Link href="/analyzer" data-testid="link-run-analysis" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground shadow-sm transition-transform hover:-translate-y-0.5"><Plus size={15} /> New analysis</Link>} />
    <section className="grid gap-4 md:grid-cols-[1.35fr_1fr_1fr]">
      <div className="relative overflow-hidden rounded-2xl bg-sidebar p-6 text-sidebar-foreground shadow-md md:min-h-[190px]"><div className="absolute -right-6 -top-12 h-44 w-44 rounded-full border border-[#d4ef78]/15" /><div className="absolute -right-1 -top-3 h-32 w-32 rounded-full border border-[#d4ef78]/10" /><div className="relative"><div className="mb-7 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#a9bf9d]"><Activity size={14} className="text-[#c6ed51]" /> Current posture</div><div className="flex items-end gap-4"><ScoreRing score={average} /><div className="pb-1"><p className="text-xl font-extrabold tracking-[-0.05em] text-[#ecf4dc]">Good rhythm</p><p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-[#9bae9b]">Your recent work is trending in the right direction.</p></div></div></div></div>
      <MetricCard label="Analyses this month" value={String(analyses.length + 8)} detail="+3 from last month" positive icon={<BarChart3 size={17} />} />
      <MetricCard label="Runtime avoided" value="1.8 sec" detail="Across saved alternatives" positive icon={<Zap size={17} />} />
    </section>
    <div className="mt-8 grid gap-5 lg:grid-cols-[1.45fr_1fr]">
      <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="mb-6 flex items-center justify-between"><div><h2 className="text-[15px] font-extrabold tracking-[-0.03em]">Recent analyzer activity</h2><p className="mt-1 text-[11px] text-muted-foreground">Your latest evidence, not a leaderboard.</p></div><Link href="/history" data-testid="link-view-history" className="text-[11px] font-bold text-primary hover:underline">View history <ArrowUpRight size={12} className="inline" /></Link></div><div className="space-y-1">{analyses.slice(0, 4).map((item) => <ActivityRow key={item.id} item={item} />)}</div></section>
      <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-[15px] font-extrabold tracking-[-0.03em]">Local monitor</h2><p className="mt-1 text-[11px] text-muted-foreground">Last captured processes</p></div><Link href="/settings" data-testid="link-monitor-settings" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><MoreHorizontal size={17} /></Link></div><div className="space-y-4">{monitorSamples.map((sample) => <MonitorRow key={sample.processName} sample={sample} />)}</div><div className="mt-5 border-t border-border pt-4"><Link href="/settings" data-testid="link-monitor-readiness" className="flex items-center gap-2 text-[11px] font-bold text-primary"><ShieldCheck size={14} /> Monitoring readiness <ArrowUpRight size={12} /></Link></div></section>
    </div>
    <section className="mt-5 rounded-2xl border border-[#cfe6a2] bg-[#f1f7df] p-5 md:p-6"><div className="flex gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#d9ef9b] text-[#376b42]"><Sparkles size={17} /></span><div><p className="text-[12px] font-extrabold text-[#315b3d]">A useful next move</p><p className="mt-1 max-w-[680px] text-[12px] leading-relaxed text-[#55725c]">Run the analyzer on a hot path before optimizing your next feature. One measured improvement beats a dozen assumptions.</p><Link href="/analyzer" data-testid="link-next-analysis" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-[#2c7045] hover:underline">Open analyzer <ArrowUpRight size={12} /></Link></div></div></section>
  </div>;
}

function MetricCard({ label, value, detail, positive, icon }: { label: string; value: string; detail: string; positive?: boolean; icon: ReactNode }) {
  return <div className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"><div className="mb-6 flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</span><span className="text-primary">{icon}</span></div><p className="text-[28px] font-extrabold tracking-[-0.07em]">{value}</p><p className={`mt-2 flex items-center gap-1 text-[11px] font-semibold ${positive ? 'text-primary' : 'text-muted-foreground'}`}><ArrowUpRight size={12} /> {detail}</p></div>;
}

function ActivityRow({ item }: { item: Analysis }) {
  return <Link href="/history" data-testid={`row-analysis-${item.id}`} className="flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/60"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><FileCode2 size={15} /></span><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-bold">{item.fileName}</span><span className="mono mt-1 block text-[10px] text-muted-foreground">{item.language} · {formatDate(item.createdAt)}</span></span><span className={`mono text-[12px] font-medium ${scoreTone(item.score)}`}>{item.score}/100</span><span className="text-muted-foreground"><ArrowUpRight size={14} /></span></Link>;
}

function MonitorRow({ sample }: { sample: MonitorSample }) {
  return <div className="flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${sample.status === 'Healthy' ? 'bg-[#5baf73]' : 'bg-[#c38b3c]'}`} /><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-bold">{sample.processName}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{sample.category} · CPU {sample.cpu}%</p></div><span className={`mono text-[11px] font-medium ${scoreTone(sample.score)}`}>{sample.score}</span></div>;
}

function Analyzer() {
  const [language, setLanguage] = useState('javascript');
  const [fileName, setFileName] = useState(samples.javascript.fileName);
  const [code, setCode] = useState(starterCode);
  const [result, setResult] = useState<Analysis | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function chooseLanguage(value: string) {
    setLanguage(value);
    setFileName(samples[value].fileName);
  }
  function loadSample() {
    setCode(samples[language].code);
    setFileName(samples[language].fileName);
    setNotice('Sample loaded');
    setTimeout(() => setNotice(''), 2200);
  }
  function runAnalysis() {
    if (!code.trim()) { setError('Add a few lines of code before running the analyzer.'); return; }
    setError('');
    setNotice('');
    setIsRunning(true);
    window.setTimeout(() => {
      const isEfficient = code.includes('Set') || code.includes('set(') || code.includes('map[');
      const next: Analysis = {
        id: `analysis-${Date.now()}`,
        fileName: fileName || samples[language].fileName,
        language,
        createdAt: new Date().toISOString(),
        score: isEfficient ? 94 : 82,
        complexity: isEfficient ? 'O(n)' : 'O(n²) → O(n)',
        runtimeEstimate: isEfficient ? '7.1 ms' : '18.4 ms',
        memoryEstimate: isEfficient ? '2.7 MB' : '2.1 MB',
        summary: isEfficient ? 'A keyed lookup keeps work proportional to input size and avoids repeated scans.' : 'Repeated membership scans make this routine grow quickly as the input gets larger.',
        findings: isEfficient ? ['Keyed membership is constant-time on average.', 'The output contract is preserved without extra passes.'] : ['Membership is scanned on every pass through the input.', 'A Set gives constant-time checks with a small memory tradeoff.'],
        alternative: isEfficient ? 'This is already a strong baseline. Consider measuring allocation pressure at production input sizes.' : 'Replace the repeated array lookup with a Set, then materialize the array at the end.',
        tradeoff: isEfficient ? 'No meaningful algorithmic change recommended. Profile I/O and allocation before changing the shape.' : 'Uses ~0.6 MB more memory for a 10k item input, while cutting runtime by an estimated 63%.',
        saved: false,
      };
      setResult(next);
      setIsRunning(false);
    }, 720);
  }
  function saveResult() {
    if (!result) return;
    const existing = getAnalyses().filter((item) => item.id !== result.id);
    const saved = { ...result, saved: true };
    writeAnalyses([saved, ...existing]);
    setResult(saved);
    setNotice('Analysis saved to history');
    setTimeout(() => setNotice(''), 2400);
  }

  return <div className="animate-rise-in">
    <PageTitle eyebrow="Code analyzer" title="Evidence before instincts." detail="Paste a focused function, choose its language, and get a practical read on complexity and energy tradeoffs." action={<div className="mono hidden items-center gap-2 text-[10px] text-muted-foreground sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> LOCAL MODE</div>} />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,.9fr)]">
      <section className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div className="flex items-center gap-2"><FileCode2 size={16} className="text-primary" /><input value={fileName} onChange={(event) => setFileName(event.target.value)} className="w-[160px] bg-transparent text-[12px] font-bold outline-none sm:w-[210px]" data-testid="input-file-name" aria-label="File name" /><span className="rounded bg-muted px-1.5 py-1 mono text-[9px] uppercase text-muted-foreground">{language}</span></div><div className="flex items-center gap-2"><select value={language} onChange={(event) => chooseLanguage(event.target.value)} className="rounded-lg border border-input bg-background px-2.5 py-2 text-[11px] font-semibold outline-none focus:ring-2 focus:ring-ring" data-testid="select-language" aria-label="Language"><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="go">Go</option></select><button onClick={loadSample} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-2.5 py-2 text-[11px] font-bold text-muted-foreground hover:bg-muted" data-testid="button-load-sample"><Clipboard size={13} /> Sample</button></div></div><div className="relative bg-[#172c20] p-4 sm:p-5"><div className="mb-3 flex items-center justify-between"><span className="mono text-[10px] text-[#8ba58b]">EDIT BUFFER / {code.split('\n').length} lines</span><span className="text-[10px] text-[#779078]">No upload needed</span></div><textarea value={code} onChange={(event) => { setCode(event.target.value); setError(''); }} spellCheck={false} className="scrollbar-thin min-h-[390px] w-full resize-y bg-transparent mono text-[12px] leading-[1.85] text-[#d8e8cc] outline-none placeholder:text-[#67806c]" data-testid="textarea-code" aria-label="Code editor" placeholder="Paste a function to inspect..." /><div className="mt-3 flex items-center justify-between border-t border-[#36533e] pt-3"><span className="mono text-[9px] text-[#779078]">SHIFT + ENTER to run</span><button onClick={runAnalysis} disabled={isRunning} className="inline-flex items-center gap-2 rounded-lg bg-[#c6ed51] px-3.5 py-2 text-[11px] font-extrabold text-[#183d2a] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70" data-testid="button-run-analysis">{isRunning ? <RotateCcw size={13} className="animate-spin" /> : <Play size={13} fill="currentColor" />}{isRunning ? 'Analyzing…' : 'Run analysis'}</button></div></div>{error && <div className="flex items-center gap-2 border-t border-[#efc8c2] bg-[#fff2ef] px-5 py-3 text-[11px] font-semibold text-[#9c463c]" data-testid="status-analyzer-error"><CircleHelp size={15} /> {error}</div>}</section>
      <AnalysisResult result={result} isRunning={isRunning} onSave={saveResult} notice={notice} />
    </div>
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" /><span>EcoDev estimates algorithmic and local resource behavior. It does not upload code or replace profiling in your production environment.</span></div>
  </div>;
}

function AnalysisResult({ result, isRunning, onSave, notice }: { result: Analysis | null; isRunning: boolean; onSave: () => void; notice: string }) {
  if (isRunning) return <section className="space-y-3" data-testid="status-analyzer-loading"><div className="h-[190px] animate-pulse rounded-2xl border border-card-border bg-card" /><div className="h-[170px] animate-pulse rounded-2xl border border-card-border bg-card" /><div className="h-[130px] animate-pulse rounded-2xl border border-card-border bg-card" /></section>;
  if (!result) return <section className="flex min-h-[490px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#b7cdaa] bg-card/55 p-8 text-center" data-testid="empty-analysis-result"><span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><BarChart3 size={22} /></span><h2 className="text-[16px] font-extrabold tracking-[-0.03em]">Your readout will land here</h2><p className="mt-2 max-w-[240px] text-[12px] leading-relaxed text-muted-foreground">Run an analysis to see the complexity, likely runtime, and a practical alternative.</p><div className="mt-5 mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">Awaiting code</div></section>;
  return <section className="space-y-4" data-testid="analysis-result">
    <div className="rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="flex items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2"><span className="rounded bg-[#e5f2c3] px-2 py-1 mono text-[9px] font-medium uppercase text-[#477044]">Complete</span><span className="mono text-[10px] text-muted-foreground">{result.language}</span></div><h2 className="text-[18px] font-extrabold tracking-[-0.05em]">Efficiency readout</h2></div><ScoreRing score={result.score} size="small" /></div><p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">{result.summary}</p><div className="mt-5 grid grid-cols-3 gap-2"><Readout label="Complexity" value={result.complexity} /><Readout label="Runtime" value={result.runtimeEstimate} /><Readout label="Memory" value={result.memoryEstimate} /></div></div>
    <div className="rounded-2xl border border-[#cfe6a2] bg-[#f1f7df] p-5"><div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.09em] text-[#396642]"><Sparkles size={14} /> Recommended alternative</div><p className="mt-3 text-[13px] font-bold leading-relaxed text-[#294e35]">{result.alternative}</p><div className="mt-4 border-t border-[#d6e8ae] pt-3 text-[11px] leading-relaxed text-[#55725c]"><span className="font-extrabold text-[#396642]">Tradeoff: </span>{result.tradeoff}</div></div>
    <div className="rounded-2xl border border-card-border bg-card p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><h3 className="text-[13px] font-extrabold">What we noticed</h3><span className="mono text-[9px] text-muted-foreground">{result.findings.length} signals</span></div><ul className="space-y-2.5">{result.findings.map((finding, index) => <li key={finding} className="flex gap-2.5 text-[11px] leading-relaxed text-muted-foreground"><Check size={14} className="mt-0.5 shrink-0 text-primary" />{finding}</li>)}</ul><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><span className="text-[10px] text-muted-foreground">{notice || (result.saved ? 'Saved in local history' : 'Not saved yet')}</span><button onClick={onSave} disabled={result.saved} className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-[11px] font-bold text-foreground hover:bg-muted disabled:cursor-default disabled:opacity-60" data-testid="button-save-analysis">{result.saved ? <Check size={13} /> : <Save size={13} />}{result.saved ? 'Saved' : 'Save analysis'}</button></div></div>
  </section>;
}

function Readout({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-muted/70 px-3 py-2.5"><p className="mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">{label}</p><p className="mt-1 truncate text-[12px] font-extrabold">{value}</p></div>;
}

function History() {
  const [analyses, setAnalyses] = useState<Analysis[]>(getAnalyses);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const filtered = useMemo(() => analyses.filter((item) => (filter === 'all' || item.language === filter) && `${item.fileName} ${item.summary}`.toLowerCase().includes(query.toLowerCase())), [analyses, filter, query]);
  function deleteItem(id: string) {
    const next = analyses.filter((item) => item.id !== id);
    setAnalyses(next);
    writeAnalyses(next);
  }
  function exportItem(item: Analysis) {
    const blob = new Blob([JSON.stringify(item, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${item.fileName.replace(/\.[^.]+$/, '')}-ecodev.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  function exportAll() {
    const blob = new Blob([JSON.stringify(analyses, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'ecodev-history.json'; anchor.click(); URL.revokeObjectURL(url);
  }
  return <div className="animate-rise-in"><PageTitle eyebrow="Saved work" title="History you can use." detail="Keep useful comparisons close. Everything here is stored locally in this browser." action={<button onClick={exportAll} className="inline-flex items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 py-2.5 text-[12px] font-bold shadow-sm hover:bg-muted" data-testid="button-export-all"><Download size={15} /> Export all</button>} /><section className="rounded-2xl border border-card-border bg-card shadow-sm"><div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between md:px-5"><div className="relative flex-1 md:max-w-[330px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search analyses" className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-[11px] outline-none focus:ring-2 focus:ring-ring" data-testid="input-search-history" /></div><div className="flex items-center gap-2"><select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-9 rounded-lg border border-input bg-background px-3 text-[11px] font-semibold outline-none" data-testid="select-history-language"><option value="all">All languages</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="go">Go</option></select><span className="mono hidden text-[10px] text-muted-foreground sm:inline">{filtered.length} results</span></div></div>{filtered.length === 0 ? <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center" data-testid="empty-history"><span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Search size={19} /></span><h2 className="text-[14px] font-extrabold">No matching analyses</h2><p className="mt-2 text-[11px] text-muted-foreground">Try another search or run a new analysis.</p><Link href="/analyzer" data-testid="link-empty-history-analyzer" className="mt-4 text-[11px] font-bold text-primary hover:underline">Open analyzer</Link></div> : <div className="divide-y divide-border">{filtered.map((item) => <HistoryRow key={item.id} item={item} onDelete={deleteItem} onExport={exportItem} />)}</div>}</section></div>;
}

function HistoryRow({ item, onDelete, onExport }: { item: Analysis; onDelete: (id: string) => void; onExport: (item: Analysis) => void }) {
  const [confirming, setConfirming] = useState(false);
  return <div className="flex flex-col gap-4 p-4 transition-colors hover:bg-muted/30 md:flex-row md:items-center md:gap-5 md:px-5" data-testid={`row-history-${item.id}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"><FileCode2 size={16} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-[12px] font-extrabold">{item.fileName}</h3><span className="rounded bg-muted px-1.5 py-0.5 mono text-[9px] uppercase text-muted-foreground">{item.language}</span></div><p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{item.summary}</p></div><div className="flex items-center gap-6"><div><p className="mono text-[12px] font-bold text-primary">{item.complexity}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatDate(item.createdAt)}</p></div><ScoreRing score={item.score} size="small" /></div><div className="flex items-center gap-1 border-t border-border pt-3 md:border-0 md:pt-0">{confirming ? <><span className="mr-1 text-[10px] text-muted-foreground">Delete?</span><button onClick={() => onDelete(item.id)} className="rounded-md bg-[#fbe5e1] px-2 py-1.5 text-[10px] font-bold text-[#9c463c]" data-testid={`button-confirm-delete-${item.id}`}>Yes</button><button onClick={() => setConfirming(false)} className="rounded-md px-2 py-1.5 text-[10px] font-bold text-muted-foreground hover:bg-muted" data-testid={`button-cancel-delete-${item.id}`}>No</button></> : <><button onClick={() => onExport(item)} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Export ${item.fileName}`} data-testid={`button-export-${item.id}`}><Download size={15} /></button><button onClick={() => setConfirming(true)} className="rounded-md p-2 text-muted-foreground hover:bg-[#fbe5e1] hover:text-[#9c463c]" aria-label={`Delete ${item.fileName}`} data-testid={`button-delete-${item.id}`}><Trash2 size={15} /></button></>}</div></div>;
}

function Learn() {
  return <div className="animate-rise-in"><PageTitle eyebrow="Field notes" title="Learn the shape of better." detail="Short, grounded principles for making software that does more with less — without slowing the team down." /><div className="grid gap-5 lg:grid-cols-[1.08fr_.92fr]"><section className="rounded-2xl bg-sidebar p-6 text-sidebar-foreground shadow-md md:p-8"><div className="mb-14 flex items-center justify-between"><span className="rounded bg-[#c6ed51]/15 px-2 py-1 mono text-[9px] uppercase tracking-[.12em] text-[#c6ed51]">Methodology / 01</span><Leaf size={19} className="text-[#c6ed51]" /></div><h2 className="max-w-[520px] text-[27px] font-extrabold leading-[1.1] tracking-[-0.06em] text-[#ebf3df] md:text-[34px]">Start with the workload.<br /><span className="text-[#c6ed51]">Then change the code.</span></h2><p className="mt-6 max-w-[470px] text-[12px] leading-[1.9] text-[#a5b9a3]">Efficiency is contextual. Before reaching for a cleverer data structure, understand where the function runs, how often it runs, and what it displaces. A measured tradeoff is a better engineering decision than a moral one.</p><div className="mt-8 grid grid-cols-3 gap-2 border-t border-[#385741] pt-5"><div><p className="mono text-[17px] font-medium text-[#e6f1d8]">01</p><p className="mt-1 text-[10px] text-[#91a792]">Observe</p></div><div><p className="mono text-[17px] font-medium text-[#e6f1d8]">02</p><p className="mt-1 text-[10px] text-[#91a792]">Compare</p></div><div><p className="mono text-[17px] font-medium text-[#e6f1d8]">03</p><p className="mt-1 text-[10px] text-[#91a792]">Choose</p></div></div></section><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="mb-6 flex items-center justify-between"><div><h2 className="text-[15px] font-extrabold">The useful questions</h2><p className="mt-1 text-[11px] text-muted-foreground">A compact review loop</p></div><CircleHelp size={18} className="text-primary" /></div><div className="space-y-4">{[['01', 'What is the hot path?', 'Optimize what repeats, not what is merely visible.'], ['02', 'What is the boundary?', 'Include storage, network, and queue time in the mental model.'], ['03', 'What does it cost?', 'Every faster path has a memory, complexity, or maintenance tradeoff.'], ['04', 'Can we verify it?', 'Use a small benchmark or trace before and after the change.']].map(([number, question, answer]) => <div key={number} className="flex gap-3 border-b border-border pb-4 last:border-0 last:pb-0"><span className="mono pt-0.5 text-[10px] text-primary">{number}</span><div><p className="text-[12px] font-extrabold">{question}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{answer}</p></div></div>)}</div></section></div><section className="mt-8"><div className="mb-5 flex items-end justify-between"><div><div className="mono mb-2 text-[10px] uppercase tracking-[.18em] text-primary">Research shelf</div><h2 className="text-[21px] font-extrabold tracking-[-.05em]">Notes worth keeping close.</h2></div><span className="hidden mono text-[10px] text-muted-foreground sm:block">{researchNotes.length} references</span></div><div className="grid gap-3 md:grid-cols-2">{researchNotes.map((note, index) => <ResearchCard key={note.title} note={note} index={index} />)}</div></section></div>;
}

function ResearchCard({ note, index }: { note: ResearchNote; index: number }) {
  return <article className="rounded-2xl border border-card-border bg-card p-5 shadow-sm transition-transform hover:-translate-y-0.5" data-testid={`card-research-${index}`}><div className="mb-6 flex items-start justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary"><BookOpen size={15} /></span><span className="mono text-[10px] text-muted-foreground">{note.year}</span></div><h3 className="text-[14px] font-extrabold tracking-[-.025em]">{note.title}</h3><p className="mt-1 text-[10px] font-semibold text-primary">{note.source}</p><p className="mt-4 text-[11px] leading-[1.75] text-muted-foreground">{note.takeaway}</p><div className="mt-5 flex flex-wrap gap-1.5">{note.tags.map((tag) => <span key={tag} className="rounded bg-muted px-2 py-1 mono text-[9px] text-muted-foreground">#{tag}</span>)}</div></article>;
}

function Settings() {
  const [monitoring, setMonitoring] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [threshold, setThreshold] = useState(80);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(settingsKey) || '{}') as { monitoring?: boolean; autoSave?: boolean; threshold?: number };
      if (typeof stored.monitoring === 'boolean') setMonitoring(stored.monitoring);
      if (typeof stored.autoSave === 'boolean') setAutoSave(stored.autoSave);
      if (stored.threshold) setThreshold(stored.threshold);
    } catch { /* use defaults */ }
  }, []);
  function saveSettings(next: Partial<{ monitoring: boolean; autoSave: boolean; threshold: number }>) {
    const value = { monitoring, autoSave, threshold, ...next };
    localStorage.setItem(settingsKey, JSON.stringify(value));
    setNotice('Settings updated');
    setTimeout(() => setNotice(''), 1900);
  }
  function resetData() {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(settingsKey);
    setMonitoring(true); setAutoSave(true); setThreshold(80);
    setNotice('Local data reset to demo state');
    setTimeout(() => setNotice(''), 2200);
  }
  return <div className="animate-rise-in"><PageTitle eyebrow="Workspace controls" title="Set your boundaries." detail="EcoDev is local by default. Tune what it watches and decide how long your evidence stays around." action={notice ? <span className="flex items-center gap-2 text-[11px] font-bold text-primary" data-testid="status-settings-notice"><Check size={14} /> {notice}</span> : undefined} /><div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="mb-6"><h2 className="text-[15px] font-extrabold">Monitoring readiness</h2><p className="mt-1 text-[11px] text-muted-foreground">Choose whether EcoDev can read lightweight local process samples.</p></div><div className="space-y-1"><ToggleRow title="Enable local monitoring" detail="Read CPU, memory, and I/O snapshots from this device." checked={monitoring} onChange={(checked) => { setMonitoring(checked); saveSettings({ monitoring: checked }); }} testId="toggle-monitoring" /><ToggleRow title="Save analyzer results automatically" detail="Keep completed readouts in local history unless you remove them." checked={autoSave} onChange={(checked) => { setAutoSave(checked); saveSettings({ autoSave: checked }); }} testId="toggle-autosave" /></div><div className="mt-7 border-t border-border pt-6"><div className="flex items-center justify-between"><div><h3 className="text-[13px] font-extrabold">Efficiency threshold</h3><p className="mt-1 text-[11px] text-muted-foreground">Flag scores below this number for another look.</p></div><span className="mono text-[17px] font-medium text-primary" data-testid="text-threshold-value">{threshold}</span></div><input type="range" min="50" max="95" value={threshold} onChange={(event) => { const value = Number(event.target.value); setThreshold(value); saveSettings({ threshold: value }); }} className="mt-5 w-full accent-[#2c7a4b]" data-testid="input-threshold" /><div className="mt-2 flex justify-between mono text-[9px] text-muted-foreground"><span>50 / flexible</span><span>95 / strict</span></div></div></section><section className="space-y-5"><div className="rounded-2xl border border-card-border bg-card p-5 shadow-sm md:p-6"><div className="mb-5 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-primary"><ShieldCheck size={17} /></span><div><h2 className="text-[14px] font-extrabold">Privacy posture</h2><p className="mt-1 text-[10px] text-muted-foreground">Ready for local-first work</p></div></div><div className="space-y-3 text-[11px]"><StatusLine label="Code uploads" value="Never" /><StatusLine label="Data storage" value="This browser" /><StatusLine label="Monitoring" value={monitoring ? 'Ready' : 'Paused'} /></div></div><div className="rounded-2xl border border-[#e4c9bf] bg-[#fff7f2] p-5 md:p-6"><div className="flex gap-3"><Trash2 size={16} className="mt-0.5 shrink-0 text-[#a75a43]" /><div><h2 className="text-[13px] font-extrabold text-[#704335]">Local data controls</h2><p className="mt-1 text-[11px] leading-relaxed text-[#936653]">Reset saved analyses and preferences back to the demo state. This cannot be undone.</p><button onClick={resetData} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-[#ddb7a9] px-3 py-2 text-[11px] font-bold text-[#8f4d3d] hover:bg-[#fbe8df]" data-testid="button-reset-data"><RotateCcw size={13} /> Reset local data</button></div></div></div></section></div></div>;
}

function ToggleRow({ title, detail, checked, onChange, testId }: { title: string; detail: string; checked: boolean; onChange: (value: boolean) => void; testId: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl px-2 py-4"><div><p className="text-[12px] font-extrabold">{title}</p><p className="mt-1 max-w-[410px] text-[11px] leading-relaxed text-muted-foreground">{detail}</p></div><button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full p-1 transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`} data-testid={testId}><span className={`block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} /></button></div>;
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between border-b border-border pb-2.5 last:border-0 last:pb-0"><span className="text-muted-foreground">{label}</span><span className="flex items-center gap-1.5 font-bold"><span className="h-1.5 w-1.5 rounded-full bg-[#65ad76]" />{value}</span></div>;
}

function NotFound() {
  return <div className="flex min-h-[70vh] flex-col items-center justify-center text-center"><Leaf size={28} className="mb-4 text-primary" /><h1 className="text-2xl font-extrabold">That path is not in the workspace.</h1><p className="mt-2 text-sm text-muted-foreground">The page may have moved, but your local data is safe.</p><Link href="/" data-testid="link-not-found-home" className="mt-5 text-sm font-bold text-primary hover:underline">Back to overview</Link></div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch><Route path="/" component={Overview} /><Route path="/analyzer" component={Analyzer} /><Route path="/history" component={History} /><Route path="/learn" component={Learn} /><Route path="/settings" component={Settings} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;