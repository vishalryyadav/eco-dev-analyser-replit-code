import assert from "node:assert/strict";
import test from "node:test";
import { coachCode } from "./coach.ts";

test("local rules coach returns useful rule-backed guidance for a matching finding", async () => {
  const result = await coachCode({
    code: "for (;;) {}",
    language: "javascript",
    analysis: { findings: [{ severity: "high", detail: "Nested scans can become quadratic." }], alternatives: [{ title: "Use a Set", description: "Avoid repeated linear membership checks." }] } as any,
    security: { findings: [] } as any,
    instruction: "minimize runtime",
  });
  assert.equal(result.provider, "local-rules");
  assert.match(result.summary, /high-priority hotspot/);
  assert.ok(result.recommendations.some((item) => item.includes("Nested scans")));
  assert.equal(result.instruction, "minimize runtime");
});

test("local rules coach gives an explicit useful response when no matching rule exists", async () => {
  const result = await coachCode({ code: "console.log('ok')", language: "javascript", analysis: { findings: [], alternatives: [] } as any, security: { findings: [] } as any });
  assert.equal(result.provider, "local-rules");
  assert.match(result.summary, /No high-priority static hotspot/);
  assert.equal(result.recommendations.length, 0);
});
