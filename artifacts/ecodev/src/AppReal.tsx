import { useMemo, useState } from 'react';
import { BookOpen, Check, Code2, Gauge, Leaf, LineChart, Loader2, Menu, Play, RefreshCw, Save, Settings, ShieldCheck, Sparkles, X, Zap } from 'lucide-react';

type Alternative = {
  id: string; title: string; description: string; complexity: string;
  expectedRuntimeChange: string; expectedMemoryChange: string; simplicity: string;
  readability: string; maintainability: string; portability: string;
  projectedEnergyChange: string; projectedCarbonChange: string; code?: string;
};
type AnalysisResponse = {
  ok: boolean;
  submission: { language: string; detectionConfidence: string; bytes: number; lines: number };
  analysis: { score: number; complexity: { time: string; space: string; basis: string }; findings: { severity: string; title: string; detail: string }[]; alternatives: Alternative[] };
  compile: { status: string; wallTimeMs: number | null; cpuTimeMs: number | null; stderr: string; measured: boolean } | null;
  execution: { status: string; wallTimeMs: number | null; cpuTimeMs: number | null; peakMemoryKb: number | null; stdout: string; stderr: string; measured: boolean; sandbox: string } | null;
  eco: { energyWh: number | null; carbonGrams: number | null; measured: boolean; basis: string; assumptions: { cpuPackageWatts: number; carbonIntensityGPerKwh: number } };
  comparison: { delta: { runtimeMs: number | null; runtimePercent: number | null; peakMemoryKb: number | null; carbonGrams: number | null }; execution: AnalysisResponse['execution']; eco: AnalysisResponse['eco'] } | null;
  limits: { timeoutMs: number; memoryMb: number; processLimit: number };
  model: { note: string };
};

const samples: Record<string, { fileName: string; code: string }> = {
  javascript: { fileName: 'analysis.js', code: `function uniqueItems(items) {\n  const result = [];\n  for (let i = 0; i < items.length; i++) {\n    if (!result.includes(items[i])) result.push(items[i]);\n  }\n  return result;\n}\n\nconsole.log(uniqueItems(Array.from({ length: 1000 }, (_, i) => i % 400)).length);` },
  typescript: { fileName: 'analysis.ts', code: `function groupBy<T>(items: T[], key: keyof T) {\n  return items.reduce((groups, item) => {\n    const value = String(item[key]);\n    (groups[value] ??= []).push(item);\n    return groups;\n  }, {} as Record<string, T[]>);\n}\n\nconsole.log(groupBy([{id: 1}, {id: 1}, {id: 2}], 'id'));` },
  python: { fileName: 'analysis.py', code: `def latest(records):\n    out = {}\n    for record in records:\n        key = record["user_id"]\n        if key not in out or record["created_at"] > out[key]["created_at"]:\n            out[key] = record\n    return list(out.values())\n\nprint(latest([{"user_id": 1, "created_at": 2}, {"user_id": 1, "created_at": 3}]))` },
  c: { fileName: 'analysis.c', code: `#include <stdio.h>\nint main(void) {\n  long total = 0;\n  for (int i = 0; i < 500000; i++) total += i;\n  printf("%ld\\n", total);\n  return 0;\n}` },
  cpp: { fileName: 'analysis.cpp', code: `#include <iostream>\nint main() {\n  long long total = 0;\n  for (int i = 0; i < 500000; ++i) total += i;\n  std::cout << total << "\\n";\n}` },
  go: { fileName: 'analysis.go', code: `package main\nimport "fmt"\nfunc main() {\n  total := 0\n  for i := 0; i < 500000; i++ { total += i }\n  fmt.Println(total)\n}` },
};

const languageLabels: Record<string, string> = { javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', c: 'C', cpp: 'C++', go: 'Go' };

function formatMs(value: number | null) { return value == null ? 'Unavailable' : `${value.toFixed(3)} ms`; }
function formatMemory(value: number | null) { return value == null ? 'Unavailable' : value < 1024 ? `${value} KB` : `${(value / 1024).toFixed(2)} MB`; }
function formatEnergy(value: number | null) { return value == null ? 'Unavailable' : `${value.toFixed(6)} Wh`; }
function formatCarbon(value: number | null) { return value == null ? 'Unavailable' : `${value.toFixed(6)} gCO₂e`; }

export default function AppReal() {
  const [page, setPage] = useState<'overview' | 'analyzer' | 'history' | 'learn' | 'settings'>('analyzer');
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState(samples.javascript.code);
  const [fileName, setFileName] = useState(samples.javascript.fileName);
  const [candidateCode, setCandidateCode] = useState('');
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedAlt, setSelectedAlt] = useState('');
  const [history, setHistory] = useState<AnalysisResponse[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentAlternative = useMemo(() => result?.analysis.alternatives.find((a) => a.id === selectedAlt), [result, selectedAlt]);

  function loadSample(nextLanguage: string) {
    const sample = samples[nextLanguage] ?? samples.javascript;
    setLanguage(nextLanguage); setCode(sample.code); setFileName(sample.fileName); setResult(null); setError(''); setCandidateCode('');
  }

  async function analyze(compare = false) {
    setLoading(!compare); setCompareLoading(compare); setError('');
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, execute: true, ...(compare && candidateCode.trim() ? { compareCode: candidateCode, compareLanguage: language } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Analysis failed');
      setResult(data);
      if (!compare) setHistory((prev) => [data, ...prev].slice(0, 12));
    } catch (err) { setError(err instanceof Error ? err.message : 'Analysis failed'); }
    finally { setLoading(false); setCompareLoading(false); }
  }

  function useAlternative() {
    if (!currentAlternative?.code) return;
    setCandidateCode(currentAlternative.code);
  }

  const nav = [
    ['overview', 'Overview', Gauge], ['analyzer', 'Analyzer', Code2], ['history', 'History', LineChart], ['learn', 'Learn', BookOpen], ['settings', 'Settings', Settings],
  ] as const;

  return (
    <div className="min-h-[100dvh] bg-[#0d1b14] text-[#e7f0d6]">
      <aside className={`fixed inset-y-0 left-0 z-50 w-[250px] border-r border-[#294734] bg-[#10281b] p-5 transition-transform md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="mb-10 flex items-center justify-between"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#c6ed51] text-[#183d2a]"><Leaf size={19} /></span><b>EcoDev</b></div><button className="md:hidden" onClick={() => setMobileOpen(false)}><X size={18}/></button></div>
        <div className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[0.17em] text-[#93aa96]">Workspace</div>
        <nav className="space-y-1">{nav.map(([id, label, Icon]) => <button key={id} onClick={() => { setPage(id); setMobileOpen(false); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[13px] font-semibold ${page === id ? 'bg-[#2c5b3d] text-white ring-1 ring-[#c6ed51]/20' : 'text-[#cfddc9] hover:bg-[#234c34]'}`}><Icon size={17}/><span>{label}</span>{id === 'analyzer' && <span className="ml-auto rounded bg-[#c6ed51]/15 px-1.5 py-0.5 font-mono text-[9px] text-[#c6ed51]">LIVE</span>}</button>)}</nav>
        <div className="mt-10 rounded-xl border border-[#31513b] bg-[#153320] p-4"><div className="mb-2 flex items-center gap-2 text-xs font-bold"><ShieldCheck size={15}/> Safe execution</div><p className="text-[11px] leading-5 text-[#a9bea9]">Runs use a restricted sandbox when Bubblewrap/Firejail is available. Without one, EcoDev fails closed and provides static analysis only.</p></div>
      </aside>

      <div className="md:pl-[250px]">
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[#243b2d] bg-[#0d1b14]/95 px-4 py-4 backdrop-blur md:px-8"><button className="md:hidden" onClick={() => setMobileOpen(true)}><Menu size={20}/></button><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#86a18c]">Eco-efficient software engineering</p><h1 className="mt-1 text-lg font-extrabold">{page === 'analyzer' ? 'Code Analyzer' : page[0].toUpperCase()+page.slice(1)}</h1></div><div className="flex items-center gap-2 text-xs text-[#91a994]"><Zap size={15}/> dynamic measurements</div></header>

        {page === 'analyzer' && <main className="mx-auto max-w-[1250px] p-4 md:p-8">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><h2 className="text-3xl font-extrabold tracking-tight">Measure the code you actually submit.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#9fb4a0]">Static analysis explains algorithmic behavior. A sandbox run measures the submitted program when a secure runtime is available. Energy and carbon remain explicitly labelled estimates.</p></div><div className="flex items-center gap-2 rounded-full border border-[#35553d] px-3 py-2 text-xs text-[#b8cab3]"><Sparkles size={14}/> No hard-coded runtime metrics</div></div>

          <section className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
            <div className="rounded-2xl border border-[#2b4634] bg-[#102318] p-5 shadow-xl"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><select value={language} onChange={(e) => loadSample(e.target.value)} className="rounded-lg border border-[#36533e] bg-[#142b1e] px-3 py-2 text-sm outline-none"><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="c">C</option><option value="cpp">C++</option><option value="go">Go</option></select><input value={fileName} onChange={(e) => setFileName(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-[#36533e] bg-[#142b1e] px-3 py-2 text-sm outline-none"/></div><button onClick={() => loadSample(language)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#36533e] px-3 py-2 text-xs font-bold hover:bg-[#193322]"><RefreshCw size={14}/> Load sample</button></div><textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} className="min-h-[390px] w-full resize-y rounded-xl border border-[#294432] bg-[#09150e] p-4 font-mono text-[13px] leading-6 text-[#d8e9cf] outline-none focus:border-[#78a84a]"/><div className="mt-4 flex flex-wrap items-center gap-3"><button disabled={loading} onClick={() => analyze(false)} className="inline-flex items-center gap-2 rounded-lg bg-[#c6ed51] px-4 py-2.5 text-sm font-extrabold text-[#17301f] disabled:opacity-60">{loading ? <Loader2 className="animate-spin" size={16}/> : <Play size={16}/>} Run analysis</button><span className="text-xs text-[#8ea48f]">Max 200 KB · {languageLabels[language]}</span></div>{error && <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>}</div>

            <div className="space-y-4">
              <MetricCard label="Runtime" value={formatMs(result?.execution?.wallTimeMs ?? null)} detail={result?.execution?.measured ? 'Measured wall time' : 'Not measured'} />
              <MetricCard label="Peak memory" value={formatMemory(result?.execution?.peakMemoryKb ?? null)} detail={result?.execution?.measured ? 'Measured process RSS' : 'Not measured'} />
              <MetricCard label="Energy" value={formatEnergy(result?.eco.energyWh ?? null)} detail={result?.eco.measured ? 'Measured' : 'Estimated'} />
              <MetricCard label="Carbon" value={formatCarbon(result?.eco.carbonGrams ?? null)} detail={result?.eco.measured ? 'Measured' : 'Estimated'} />
            </div>
          </section>

          {result && <>
            <section className="mt-6 grid gap-4 lg:grid-cols-3"><InfoCard title="Algorithmic complexity" big={`${result.analysis.complexity.time} · ${result.analysis.complexity.space}`} body={result.analysis.complexity.basis}/><InfoCard title="Submission" big={`${result.submission.lines} lines · ${result.submission.bytes} bytes`} body={`${languageLabels[result.submission.language] ?? result.submission.language} · detection ${result.submission.detectionConfidence}`}/><InfoCard title="Execution status" big={result.execution?.status ?? result.compile?.status ?? 'not run'} body={result.execution?.sandbox ? `Sandbox: ${result.execution.sandbox}` : 'Static analysis only'}/></section>

            <section className="mt-6 rounded-2xl border border-[#2b4634] bg-[#102318] p-5"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-bold">Findings & hotspots</h3><p className="text-xs text-[#91a994]">Based on this exact submission.</p></div><span className="rounded-full bg-[#c6ed51]/10 px-3 py-1 text-xs font-bold text-[#c6ed51]">Score {result.analysis.score}/100</span></div><div className="space-y-3">{result.analysis.findings.map((f, i) => <div key={i} className="rounded-xl border border-[#294432] bg-[#0b1810] p-4"><div className="flex gap-3"><span className="mt-1 h-2 w-2 rounded-full bg-[#c6ed51]"/><div><div className="text-sm font-bold">{f.title}</div><div className="mt-1 text-sm leading-6 text-[#a3b7a4]">{f.detail}</div><div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#718777]">{f.severity}</div></div></div></div>)}</div></section>

            <section className="mt-6 rounded-2xl border border-[#2b4634] bg-[#102318] p-5"><div className="mb-4"><h3 className="font-bold">Optimization options</h3><p className="text-xs text-[#91a994]">Compare trade-offs instead of forcing a single “best” answer.</p></div><div className="grid gap-4 lg:grid-cols-3">{result.analysis.alternatives.map((alt) => <button key={alt.id} onClick={() => setSelectedAlt(alt.id)} className={`text-left rounded-xl border p-4 transition ${selectedAlt === alt.id ? 'border-[#91ba55] bg-[#173321]' : 'border-[#294432] bg-[#0b1810] hover:bg-[#132619]'}`}><div className="mb-2 flex items-center justify-between"><span className="text-sm font-bold">{alt.title}</span>{selectedAlt === alt.id && <Check size={16}/>}</div><p className="text-xs leading-5 text-[#a4b8a4]">{alt.description}</p><div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#8fa590]"><span>Complexity: {alt.complexity}</span><span>Memory: {alt.expectedMemoryChange}</span><span>Speed: {alt.expectedRuntimeChange}</span><span>Simple: {alt.simplicity}</span><span>Readable: {alt.readability}</span><span>Portable: {alt.portability}</span></div></button>)}</div></section>

            {currentAlternative && <section className="mt-6 grid gap-5 xl:grid-cols-2"><div className="rounded-2xl border border-[#2b4634] bg-[#102318] p-5"><div className="flex items-center justify-between"><div><h3 className="font-bold">Selected option: {currentAlternative.title}</h3><p className="mt-1 text-xs text-[#91a994]">Use the generated variant when available, then benchmark it.</p></div>{currentAlternative.code && <button onClick={useAlternative} className="inline-flex items-center gap-2 rounded-lg border border-[#36533e] px-3 py-2 text-xs font-bold"><Save size={14}/> Copy to compare</button>}</div><div className="mt-4 grid gap-2 text-xs text-[#a6baa6]"><div><b className="text-[#d6e7d0]">Maintainability:</b> {currentAlternative.maintainability}</div><div><b className="text-[#d6e7d0]">Readability:</b> {currentAlternative.readability}</div><div><b className="text-[#d6e7d0]">Portability:</b> {currentAlternative.portability}</div><div><b className="text-[#d6e7d0]">Energy:</b> {currentAlternative.projectedEnergyChange}</div><div><b className="text-[#d6e7d0]">Carbon:</b> {currentAlternative.projectedCarbonChange}</div></div></div><div className="rounded-2xl border border-[#2b4634] bg-[#102318] p-5"><h3 className="font-bold">Before / after benchmark</h3><p className="mt-1 text-xs text-[#91a994]">Paste or edit the candidate implementation. The server runs it as a separate submission.</p><textarea value={candidateCode} onChange={(e) => setCandidateCode(e.target.value)} spellCheck={false} placeholder="Candidate code goes here…" className="mt-4 min-h-[180px] w-full rounded-xl border border-[#294432] bg-[#09150e] p-3 font-mono text-xs leading-5 outline-none"/><button disabled={!candidateCode.trim() || compareLoading} onClick={() => analyze(true)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#7ca34a] px-4 py-2 text-xs font-bold disabled:opacity-50">{compareLoading ? <Loader2 className="animate-spin" size={14}/> : <LineChart size={14}/>} Test candidate</button></div></section>}

            {result.comparison && <section className="mt-6 grid gap-4 md:grid-cols-4"><InfoCard title="Runtime delta" big={result.comparison.delta.runtimePercent == null ? 'Unavailable' : `${result.comparison.delta.runtimePercent > 0 ? '+' : ''}${result.comparison.delta.runtimePercent.toFixed(2)}%`} body={`${formatMs(result.comparison.delta.runtimeMs)} vs baseline`}/><InfoCard title="Memory delta" big={result.comparison.delta.peakMemoryKb == null ? 'Unavailable' : formatMemory(result.comparison.delta.peakMemoryKb)} body="Candidate minus baseline"/><InfoCard title="Carbon delta" big={result.comparison.delta.carbonGrams == null ? 'Unavailable' : `${result.comparison.delta.carbonGrams > 0 ? '+' : ''}${result.comparison.delta.carbonGrams.toFixed(6)} g`} body="Estimated difference"/><InfoCard title="Candidate status" big={result.comparison.execution?.status ?? 'Unavailable'} body="Independent candidate run"/></section>}

            <section className="mt-6 rounded-xl border border-[#294432] bg-[#0b1810] p-4 text-xs leading-5 text-[#91a994]"><b className="text-[#d8ead1]">Eco model:</b> {result.eco.basis} Default assumptions: {result.eco.assumptions.cpuPackageWatts} W CPU-package power and {result.eco.assumptions.carbonIntensityGPerKwh} gCO₂e/kWh. These are configurable estimates, not a direct carbon meter.</section>
            {(result.compile?.stderr || result.execution?.stderr) && <section className="mt-4 rounded-xl border border-red-900/40 bg-red-950/20 p-4"><div className="text-sm font-bold text-red-200">Compiler/runtime output</div><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-red-100/80">{result.compile?.stderr || result.execution?.stderr}</pre></section>}
          </>}
        </main>}

        {page === 'overview' && <SimplePage title="Overview" text="EcoDev now measures submitted code through the same analyzer API used by the Analyzer page. Open Analyzer to run a real submission." onClick={() => setPage('analyzer')} />}
        {page === 'history' && <HistoryPage history={history} />}
        {page === 'learn' && <SimplePage title="Learn" text="Complexity is inferred from source structure; runtime and memory are measured only when the sandbox can execute the submission. Energy and carbon are model estimates unless a hardware energy meter is integrated." />}
        {page === 'settings' && <SimplePage title="Settings" text="Sandbox limits are controlled by server environment variables: execution timeout, memory cap, process count, CPU power assumption, and grid carbon intensity." />}
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-[#2b4634] bg-[#102318] p-5"><div className="text-xs text-[#8fa48f]">{label}</div><div className="mt-2 text-2xl font-extrabold tracking-tight">{value}</div><div className="mt-1 text-[11px] text-[#718676]">{detail}</div></div>; }
function InfoCard({ title, big, body }: { title: string; big: string; body: string }) { return <div className="rounded-2xl border border-[#2b4634] bg-[#102318] p-5"><div className="text-xs text-[#8fa48f]">{title}</div><div className="mt-2 text-xl font-extrabold">{big}</div><div className="mt-2 text-xs leading-5 text-[#8fa48f]">{body}</div></div>; }
function SimplePage({ title, text, onClick }: { title: string; text: string; onClick?: () => void }) { return <main className="mx-auto max-w-3xl p-6 md:p-12"><div className="rounded-2xl border border-[#2b4634] bg-[#102318] p-8"><h2 className="text-3xl font-extrabold">{title}</h2><p className="mt-4 text-sm leading-7 text-[#9fb4a0]">{text}</p>{onClick && <button onClick={onClick} className="mt-6 rounded-lg bg-[#c6ed51] px-4 py-2 text-sm font-bold text-[#17301f]">Open Analyzer</button>}</div></main>; }
function HistoryPage({ history }: { history: AnalysisResponse[] }) { return <main className="mx-auto max-w-5xl p-6 md:p-10"><h2 className="text-3xl font-extrabold">Recent analyses</h2><div className="mt-6 space-y-3">{history.length === 0 ? <div className="rounded-xl border border-[#2b4634] bg-[#102318] p-6 text-sm text-[#91a994]">No analyses in this session yet.</div> : history.map((item, i) => <div key={i} className="rounded-xl border border-[#2b4634] bg-[#102318] p-5"><div className="flex flex-wrap items-center justify-between gap-2"><b>{languageLabels[item.submission.language] ?? item.submission.language}</b><span className="text-xs text-[#91a994]">{item.submission.lines} lines · {formatMs(item.execution?.wallTimeMs ?? null)}</span></div><div className="mt-2 text-sm text-[#a3b6a3]">{item.analysis.complexity.time} · {item.analysis.complexity.space}</div></div>)}</div></main>; }
