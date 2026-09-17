import { useEffect, useState } from "react";

const AGENT = import.meta.env.VITE_ECODEV_DEVICE_AGENT_URL as
  | string
  | undefined;

type DeviceData = {
  memoryUsedPercent: number;
  batteryPercent: number | null;
  batteryCharging: boolean | null;
  loadAverage: number[];
  topProcesses: Array<{ name: string; cpuPercent: number | null }>;
  energy: { available: boolean; source: string; estimatedWatts: number | null };
  recommendations: string[];
};

export default function DeviceWidget() {
  const [data, setData] = useState<DeviceData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!AGENT) return;

    let mounted = true;
    const poll = async () => {
      try {
        const response = await fetch(AGENT, { cache: "no-store" });
        if (response.ok && mounted) setData(await response.json());
      } catch { if (mounted) setData(null); }
    };
    void poll();
    const timer = window.setInterval(poll, 5000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  // Device telemetry is an opt-in enhancement. Do not put an optional
  // companion in the normal browser workflow: the Laptop Saver page already
  // provides its core practical guidance without it.
  if (!AGENT) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[300px] text-xs">
      <button aria-expanded={open} onClick={() => setOpen(v => !v)} className="w-full rounded-xl border border-[#3b5b42] bg-[#102318]/95 px-4 py-3 text-left shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between"><span className="font-bold text-[#e7f0d6]">Optional device telemetry</span><span className={data ? "text-[#c6ed51]" : "text-[#f1ce7a]"}>{data ? "LOCAL AGENT" : "OPTIONAL"}</span></div>
        <p className="mt-1 text-[10px] text-[#91a994]">{data ? "Local device context; never a whole-laptop power claim." : "The Laptop Saver guidance works without this optional local enhancement."}</p>
        {data && <div className="mt-2 flex flex-wrap gap-3 text-[#a9bea9]"><span>RAM {data.memoryUsedPercent.toFixed(0)}% · MEASURED</span><span>Load {data.loadAverage[0]?.toFixed(1) ?? "UNAVAILABLE"} · MEASURED</span>{data.batteryPercent != null && <span>Battery {data.batteryPercent}% · MEASURED</span>}{data.energy?.estimatedWatts != null && <span>Package {data.energy.estimatedWatts.toFixed(1)} W · MEASURED</span>}</div>}
      </button>
      {open && <div className="mt-2 rounded-xl border border-[#3b5b42] bg-[#102318] p-4 shadow-2xl">
        {!data ? <><p className="font-bold text-[#e7f0d6]">Local companion not connected</p><p className="mt-2 leading-5 text-[#a9bea9]">To add opt-in device context, install and start the EcoDev desktop companion, then configure this web build with <code>VITE_ECODEV_DEVICE_AGENT_URL</code> pointing to its local <code>/v1/device</code> endpoint.</p><p className="mt-2 leading-5 text-[#718b78]">This does not affect the Analyzer or the practical Laptop Saver guidance. Runtime metrics remain separate, and energy/carbon remain modeled from valid execution duration.</p></> : <>
          <div className="mb-2 font-bold">Actionable local recommendations</div>
          <div className="space-y-2 text-[#a9bea9]">{data.recommendations.slice(0, 4).map((r, i) => <div key={i}>{r}</div>)}</div>
          <div className="mt-3 space-y-1 border-t border-[#31513b] pt-3 text-[10px] leading-4 text-[#718b78]"><p>Battery, memory, load, and process context: MEASURED locally by the companion when the operating system exposes them.</p><p>CPU package energy: {data.energy.available ? `MEASURED via ${data.energy.source}; it excludes display, storage, battery charging, and other whole-laptop loads.` : `UNAVAILABLE (${data.energy.source}).`}</p><p>Device readings stay on this machine and are not uploaded by this widget.</p></div>
        </>}
      </div>}
    </div>
  );
}
