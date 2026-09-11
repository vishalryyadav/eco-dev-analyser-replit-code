import { describe, expect, it } from "vitest";
import { securityAnalyze } from "./security";

describe("security analyzer", () => {
  it("flags dynamic evaluation and shell execution", () => {
    const result = securityAnalyze("eval(input); child_process.exec(cmd);", "javascript");
    expect(result.score).toBeLessThan(70);
    expect(result.findings.some((f) => f.title === "Dynamic code execution")).toBe(true);
    expect(result.findings.some((f) => f.title === "Shell/process invocation")).toBe(true);
  });

  it("does not report an obvious warning for ordinary arithmetic", () => {
    const result = securityAnalyze("console.log(2 + 2);", "javascript");
    expect(result.score).toBe(100);
    expect(result.findings[0].severity).toBe("info");
  });
});
