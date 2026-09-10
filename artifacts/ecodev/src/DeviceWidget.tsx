import { useEffect, useState } from "react";

const AGENT = "http://127.0.0.1:17777/v1/device";

type DeviceData = {
  memoryUsedPercent: number;
  batteryPercent: number | null;
  batteryCharging: boolean | null;
  loadAverage: number[];
  topProcesses: Array<{ name: string; cpuPercent: number | null }>;
  recommendations: string[];
};

export default function DeviceWidget() {
  const [data, setData] = useState<DeviceData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
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

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[300px] text-xs">
      <button onClick={() => setOpen(v => !v)} className="w-full rounded-xl border border-[#3b5b42] bg-[#102318]/95 px-4 py-3 text-left shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between"><span className="font-bold text-[#e7f0d6]">Laptop green monitor</span><span className={data ? "text-[#c6ed51]" : "text-[#91a994]"}>{data ? "Connected" : "Optional"}</span></div>
        {data && <div className="mt-2 flex gap-4 text-[#a9bea9]"><span>RAM {data.memoryUsedPercent.toFixed(0)}%</span><span>Load {data.loadAverage[0]?.toFixed(1) ?? "–"}</span>{data.batteryPercent != null && <span>Battery {data.batteryPercent}%</span>}</div>}
      </button>
      {open && <div className="mt-2 rounded-xl border border-[#3b5b42] bg-[#102318] p-4 shadow-2xl">
        {!data ? <p className="text-[#a9bea9]">Install/start the EcoDev desktop companion to enable device-wide recommendations. The website itself does not access OS processes.</p> : <>
          <div className="mb-2 font-bold">Recommendations</div>
          <div className="space-y-2 text-[#a9bea9]">{data.recommendations.slice(0, 4).map((r, i) => <div key={i}>• {r}</div>)}</div>
        </>}
      </div>}
    </div>
  );
}
