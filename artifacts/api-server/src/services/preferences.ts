export type OptimizationProfile = "balanced" | "fast" | "memory" | "green" | "reliable" | "secure" | "scalable";
export type PriorityWeights = { runtime: number; memory: number; energy: number; carbon: number; readable: number; maintain: number; secure: number; reliable: number; scalable: number; portable: number };

const weights: Record<OptimizationProfile, PriorityWeights> = {
  balanced: { runtime: 2, memory: 2, energy: 2, carbon: 2, maintain: 2, readable: 2, secure: 2, reliable: 2, scalable: 2, portable: 2 },
  fast: { runtime: 6, memory: 1, energy: 2, carbon: 1, maintain: 1, readable: 1, secure: 2, reliable: 2, scalable: 4, portable: 2 },
  memory: { runtime: 2, memory: 6, energy: 3, carbon: 2, maintain: 2, readable: 2, secure: 2, reliable: 3, scalable: 3, portable: 2 },
  green: { runtime: 4, memory: 4, energy: 7, carbon: 7, maintain: 2, readable: 2, secure: 2, reliable: 2, scalable: 3, portable: 2 },
  reliable: { runtime: 2, memory: 2, energy: 1, carbon: 1, maintain: 6, readable: 5, secure: 5, reliable: 8, scalable: 4, portable: 3 },
  secure: { runtime: 1, memory: 2, energy: 1, carbon: 1, maintain: 4, readable: 3, secure: 8, reliable: 6, scalable: 3, portable: 3 },
  scalable: { runtime: 5, memory: 5, energy: 3, carbon: 2, maintain: 4, readable: 2, secure: 4, reliable: 4, scalable: 8, portable: 3 },
};

function evidence(alternative: any) {
  const text = [alternative.title, alternative.description, alternative.expectedRuntimeChange, alternative.expectedMemoryChange, alternative.simplicity, alternative.readability, alternative.maintainability, alternative.portability, alternative.projectedEnergyChange, alternative.projectedCarbonChange].join(" ").toLowerCase();
  return {
    runtime: /runtime|faster|performance|o\(n|linear|constant|batch|scan/.test(text) ? 1 : 0,
    memory: /memory|space|stream|chunk|bounded|in-place/.test(text) ? 1 : 0,
    energy: /energy|carbon|emission|efficient/.test(text) ? 1 : 0,
    maintain: /maintain|simple|readab|clear|portab/.test(text) ? 1 : 0,
    readable: /readab|simple|clear/.test(text) ? 1 : 0,
    secure: /secure|safe|validation|bounded|sandbox/.test(text) ? 1 : 0,
    scalable: /scal|large|batch|stream|o\(n\)|o\(n log n\)/.test(text) ? 1 : 0,
    carbon: /carbon|emission|lower-impact/.test(text) ? 1 : 0,
    reliable: /reliab|correct|test|conservative/.test(text) ? 1 : 0,
    portable: /portab|standard|language-appropriate/.test(text) ? 1 : 0,
  };
}

function clamp(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : 0;
}

export function normalizePriorityWeights(value: unknown, profile: OptimizationProfile = "balanced"): PriorityWeights {
  const base = weights[profile] ?? weights.balanced;
  if (!value || typeof value !== "object") return { ...base };
  const input = value as Record<string, unknown>;
  return {
    runtime: clamp(input.runtime ?? input.performance ?? base.runtime), memory: clamp(input.memory ?? base.memory), energy: clamp(input.energy ?? base.energy), carbon: clamp(input.carbon ?? base.carbon),
    readable: clamp(input.readable ?? input.readability ?? base.readable), maintain: clamp(input.maintain ?? input.maintainability ?? base.maintain), secure: clamp(input.secure ?? input.security ?? base.secure), reliable: clamp(input.reliable ?? base.reliable), scalable: clamp(input.scalable ?? base.scalable), portable: clamp(input.portable ?? base.portable),
  };
}

export function rankAlternatives<T extends { id: string }>(alternatives: T[], profile: OptimizationProfile, customWeights?: unknown) {
  const w = normalizePriorityWeights(customWeights, profile);
  return alternatives.map((alternative, index) => {
    const e = evidence(alternative);
    const score = Object.entries(e).reduce((sum, [key, value]) => sum + value * (w[key as keyof PriorityWeights] ?? 0), 0);
    return { alternative, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index).map(({ alternative }) => alternative);
}

export function normalizeProfile(value: unknown): OptimizationProfile {
  const profile = String(value ?? "balanced");
  return (Object.keys(weights) as OptimizationProfile[]).includes(profile as OptimizationProfile) ? profile as OptimizationProfile : "balanced";
}
