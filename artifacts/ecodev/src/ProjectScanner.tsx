import { useState, type ChangeEvent } from 'react';
import { FolderSearch, Loader2, X } from 'lucide-react';

type Report = { filesScanned: number; totalLines: number; totalBytes: number; score: number; securityScore: number; hotspots: Array<{ path: string; score: number; complexity: string; securityScore: number; findingCount: number }>; findings: Array<{ path: string; severity: string; title: string; detail: string }>; alternatives: Array<{ title: string; description: string; files: string[] }> };

export default function ProjectScanner() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);

  async function scan(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setLoading(true); setError('');
    try {
      const source = [] as Array<{ path: string; code: string }>;
      for (const file of files.slice(0, 200)) {
        if (file.size > 100_000) continue;
        const code = await file.text();
        source.push({ path: file.webkitRelativePath || file.name, code });
      }
      const response = await fetch('/api/project/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: source }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Project scan failed');
      setReport(data.report);
    } catch (e) { setError(e instanceof Error ? e.message : 'Project scan failed'); }
    finally { setLoading(false); }
  }

  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full border border-[#36533e] bg-[#c6ed51] px-4 py-3 text-xs font-extrabold text-[#17301f] shadow-2xl hover:brightness-105"><FolderSearch size={16}/> Scan project</button>
    {open && <div className="fixed inset-0 z-[100] overflow-auto bg-black/70 p-4 backdrop-blur-sm"><div className="mx-auto mt-10 max-w-4xl rounded-2xl border border-[#31513b] bg-[#102318] p-5 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-xl font-extrabold">Project scan</h2><p className="mt-1 text-xs text-[#91a994]">Select a project folder. EcoDev scans supported text source files without executing the project.</p></div><button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-[#234c34]"><X size={18}/></button></div><label className="mt-5 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-[#4c694f] bg-[#0b1810] p-8 text-sm font-bold hover:border-[#78a84a]"><input type="file" className="hidden" multiple onChange={scan} {...({ webkitdirectory: '', directory: '' } as any)} />{loading ? <><Loader2 size={18} className="mr-2 animate-spin"/>Scanning project…</> : <>Choose project folder</>}</label>{error && <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>}{report && <div className="mt-5 space-y-4"><div className="grid gap-3 md:grid-cols-4"><K title="Files" value={String(report.filesScanned)}/><K title="Lines" value={String(report.totalLines)}/><K title="Efficiency" value={`${report.score}/100`}/><K title="Security" value={`${report.securityScore}/100`}/></div><div className="rounded-xl border border-[#294432] bg-[#0b1810] p-4"><h3 className="font-bold">Hotspots</h3><div className="mt-3 space-y-2">{report.hotspots.slice(0, 12).map((h) => <div key={h.path} className="flex items-center justify-between gap-4 rounded-lg border border-[#223b2a] p-3 text-xs"><span className="min-w-0 truncate">{h.path}</span><span className="shrink-0 text-[#c6ed51]">{h.complexity} · {h.findingCount} findings</span></div>)}</div></div><div className="rounded-xl border border-[#294432] bg-[#0b1810] p-4"><h3 className="font-bold">Optimization opportunities</h3><div className="mt-3 grid gap-2 md:grid-cols-2">{report.alternatives.slice(0, 10).map((a) => <div key={a.title} className="rounded-lg border border-[#223b2a] p-3 text-xs"><b>{a.title}</b><p className="mt-1 text-[#9fb4a0]">{a.description}</p><p className="mt-1 text-[#718777]">Files: {a.files.slice(0, 3).join(', ')}</p></div>)}</div></div></div>}</div></div>}
  </>;
}
function K({title,value}:{title:string;value:string}){ return <div className="rounded-xl border border-[#2b4634] bg-[#102318] p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-[#78907d]">{title}</div><div className="mt-2 text-lg font-extrabold">{value}</div></div> }
