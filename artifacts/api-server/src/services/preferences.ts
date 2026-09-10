export type OptimizationProfile = "balanced" | "fast" | "memory" | "green" | "reliable" | "secure" | "scalable";

const weights: Record<OptimizationProfile, Record<string, number>> = {
  balanced: { runtime: 2, memory: 2, energy: 2, maintain: 2, readable: 2, secure: 2, scalable: 2 },
  fast: { runtime: 6, memory: 1, energy: 2, maintain: 1, readable: 1, secure: 2, scalable: 4 },
  memory: { runtime: 2, memory: 6, energy: 3, maintain: 2, readable: 2, secure: 2, scalable: 3 },
  green: { runtime: 4, memory: 4, energy: 7, maintain: 2, readable: 2, secure: 2, scalable: 3 },
  reliable: { runtime: 2, memory: 2, energy: 1, maintain: 6, readable: 5, secure: 5, scalable: 4 },
  secure: { runtime: 1, memory: 2, energy: 1, maintain: 4, readable: 3, secure: 8, scalable: 3 },
  scalable: { runtime: 5, memory: 5, energy: 3, maintain: 4, readable: 2, secure: 4, scalable: 8 },
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
  };
}

export function rankAlternatives<T extends { id: string }>(alternatives: T[], profile: OptimizationProfile) {
  const w = weights[profile] ?? weights.balanced;
  return alternatives.map((alternative, index) => {
    const e = evidence(alternative);
    const score = Object.entries(e).reduce((sum, [key, value]) => sum + value * (w[key] ?? 0), 0);
    return { alternative, index, score };
  }).sort((a, b) => b.score - a.score || a.index - b.index).map(({ alternative }) => alternative);
}

export function normalizeProfile(value: unknown): OptimizationProfile {
  const profile = String(value ?? "balanced");
  return (Object.keys(weights) as OptimizationProfile[]).includes(profile as OptimizationProfile) ? profile as OptimizationProfile : "balanced";
}
