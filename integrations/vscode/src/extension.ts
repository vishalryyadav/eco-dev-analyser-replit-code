import * as vscode from 'vscode';

const LANGUAGE_MAP: Record<string, string> = {
  javascript: 'javascript', javascriptreact: 'javascript', typescript: 'typescript', typescriptreact: 'typescript',
  python: 'python', c: 'c', cpp: 'cpp', go: 'go'
};
const SUPPORTED_GLOBS = '**/*.{js,jsx,mjs,cjs,ts,tsx,py,c,h,cc,cpp,cxx,hpp,go}';

function profilePrompt(profile: string) {
  const prompts: Record<string, string> = {
    fast: 'Prefer fastest execution time while preserving correctness.', memory: 'Prefer low peak memory and bounded resource usage.', green: 'Prefer energy-efficient and lower-carbon approaches; explain performance trade-offs.', reliable: 'Prefer reliable, testable, maintainable approaches with conservative semantics.', secure: 'Prefer security-safe approaches and avoid risky dynamic behavior.', scalable: 'Prefer approaches that scale to larger inputs and production workloads.', balanced: 'Balance performance, memory, reliability, maintainability, scalability, security, and energy efficiency.'
  };
  return prompts[profile] ?? prompts.balanced;
}
async function post(endpoint: string, body: unknown) { const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ecodev-client': 'vscode' }, body: JSON.stringify(body) }); const data = await response.json() as any; if (!response.ok) throw new Error(data?.error || `EcoDev returned HTTP ${response.status}`); return data; }
function endpoint() { return String(vscode.workspace.getConfiguration('ecodev').get('endpoint') || 'http://localhost:5000/api/analyze'); }
function projectEndpoint() { return endpoint().replace(/\/api\/analyze\/?$/, '/api/project/analyze'); }
async function analyze(code: string, language: string, execute: boolean, profile: string) { return post(endpoint(), { code, language, execute, preferences: { profile, instruction: profilePrompt(profile) } }); }
function languageFor(document: vscode.TextDocument) { return LANGUAGE_MAP[document.languageId]; }
function summary(data: any) {
  const lines: string[] = [`EcoDev score: ${data.analysis?.score ?? 'n/a'}/100`, `Time: ${data.analysis?.complexity?.time ?? 'unknown'}`, `Space: ${data.analysis?.complexity?.space ?? 'unknown'}`];
  if (data.execution) lines.push(`Runtime: ${data.execution.wallTimeMs == null ? 'unavailable' : `${data.execution.wallTimeMs} ms`} (${data.execution.measured ? 'measured' : 'not measured'})`);
  if (data.execution?.peakMemoryKb != null) lines.push(`Peak memory: ${(data.execution.peakMemoryKb / 1024).toFixed(2)} MB`);
  if (data.eco) lines.push(`Energy: ${data.eco.energyWh == null ? 'unavailable' : `${data.eco.energyWh} Wh`} (${data.eco.measured ? 'measured' : 'estimated'})`);
  if (data.eco) lines.push(`Carbon: ${data.eco.carbonGrams == null ? 'unavailable' : `${data.eco.carbonGrams} gCO2e`} (${data.eco.measured ? 'measured' : 'estimated'})`);
  for (const finding of (data.analysis?.findings ?? []).slice(0, 6)) lines.push(`• ${finding.title}: ${finding.detail}`);
  for (const alt of (data.analysis?.alternatives ?? []).slice(0, 6)) lines.push(`→ ${alt.title}: ${alt.expectedRuntimeChange}; ${alt.expectedMemoryChange}; ${alt.projectedEnergyChange}.`);
  return lines.join('\n');
}

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('EcoDev');
  const diagnostics = vscode.languages.createDiagnosticCollection('ecodev');
  context.subscriptions.push(output, diagnostics);
  const run = async (selectionOnly: boolean) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return vscode.window.showInformationMessage('Open a supported source file first.');
    const language = languageFor(editor.document);
    if (!language) return vscode.window.showWarningMessage('EcoDev supports JavaScript, TypeScript, Python, C, C++, and Go in VS Code.');
    const code = selectionOnly ? editor.document.getText(editor.selection) : editor.document.getText();
    if (!code.trim()) return vscode.window.showWarningMessage('There is no code to analyze.');
    const config = vscode.workspace.getConfiguration('ecodev'); const execute = Boolean(config.get('executeCode')); const profile = String(config.get('profile') || 'balanced');
    try {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'EcoDev analyzing code…' }, async () => {
        const data = await analyze(code, language, execute, profile); output.clear(); output.appendLine(summary(data)); output.show(true);
        diagnostics.delete(editor.document.uri);
        const warnings = (data.analysis?.findings ?? []).filter((f: any) => f.severity === 'warning' || f.severity === 'high').slice(0, 10);
        diagnostics.set(editor.document.uri, warnings.map((f: any) => new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), f.title, vscode.DiagnosticSeverity.Warning)));
        vscode.window.setStatusBarMessage(`EcoDev ${data.analysis?.score ?? ''}/100 · ${data.analysis?.complexity?.time ?? 'complexity unknown'}`, 5000);
        const alternatives = (data.analysis?.alternatives ?? []).slice(0, 6).map((alt: any) => ({ label: alt.title, description: `${alt.complexity} · ${alt.expectedRuntimeChange} · ${alt.expectedMemoryChange}`, detail: `${alt.projectedEnergyChange} · ${alt.projectedCarbonChange}`, alt })) as Array<vscode.QuickPickItem & { alt: any }>;
        if (alternatives.length) { const pick = await vscode.window.showQuickPick(alternatives, { placeHolder: 'Choose an optimization approach to inspect its trade-offs', ignoreFocusOut: true }); if (pick) { output.appendLine(`\nSelected alternative: ${pick.alt.title}`); output.appendLine(`Complexity: ${pick.alt.complexity}`); output.appendLine(`Runtime: ${pick.alt.expectedRuntimeChange}`); output.appendLine(`Memory: ${pick.alt.expectedMemoryChange}`); output.appendLine(`Energy: ${pick.alt.projectedEnergyChange}`); output.appendLine(`Carbon: ${pick.alt.projectedCarbonChange}`); output.show(true); } }
      });
    } catch (error) { const message = error instanceof Error ? error.message : 'EcoDev analysis failed'; output.appendLine(message); output.show(true); vscode.window.showErrorMessage(message); }
  };
  const scanWorkspace = async () => {
    const workspace = vscode.workspace.workspaceFolders?.[0]; if (!workspace) return vscode.window.showInformationMessage('Open a workspace before running a project scan.');
    try { await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'EcoDev scanning workspace…' }, async () => {
      const uris = await vscode.workspace.findFiles(SUPPORTED_GLOBS, '**/{node_modules,.git,dist,build,coverage}/**', 200); const files: Array<{ path: string; code: string }> = [];
      for (const uri of uris) { const bytes = await vscode.workspace.fs.readFile(uri); if (bytes.byteLength > 100000) continue; files.push({ path: vscode.workspace.asRelativePath(uri), code: Buffer.from(bytes).toString('utf8') }); }
      const result = await post(projectEndpoint(), { files }); output.clear(); output.appendLine(`Workspace files: ${result.report.filesScanned}`); output.appendLine(`Lines: ${result.report.totalLines}`); output.appendLine(`Efficiency: ${result.report.score}/100`); output.appendLine(`Security: ${result.report.securityScore}/100`); output.appendLine('\nHotspots:'); for (const h of result.report.hotspots.slice(0, 15)) output.appendLine(`• ${h.path} — ${h.complexity} — ${h.findingCount} findings`); output.appendLine('\nOptimization opportunities:'); for (const alt of result.report.alternatives.slice(0, 10)) output.appendLine(`→ ${alt.title}: ${alt.description}`); output.show(true); vscode.window.showInformationMessage(`EcoDev scanned ${result.report.filesScanned} source files.`);
    }); } catch (error) { vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Workspace scan failed'); }
  };
  context.subscriptions.push(vscode.commands.registerCommand('ecodev.analyzeFile', () => run(false)), vscode.commands.registerCommand('ecodev.analyzeSelection', () => run(true)), vscode.commands.registerCommand('ecodev.analyzeWorkspace', scanWorkspace), vscode.commands.registerCommand('ecodev.openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:ecodev.ecodev-green-code')));
  const onSave = vscode.workspace.onDidSaveTextDocument(async (document) => { if (!vscode.workspace.getConfiguration('ecodev').get('analyzeOnSave')) return; const language = languageFor(document); if (!language) return; try { const data = await analyze(document.getText(), language, Boolean(vscode.workspace.getConfiguration('ecodev').get('executeCode')), String(vscode.workspace.getConfiguration('ecodev').get('profile') || 'balanced')); output.appendLine(`On-save ${document.fileName}: ${data.analysis?.score ?? 'n/a'}/100 · ${data.analysis?.complexity?.time ?? 'complexity unknown'}`); } catch (error) { output.appendLine(`On-save error: ${error instanceof Error ? error.message : 'unknown error'}`); } });
  context.subscriptions.push(onSave);
}
export function deactivate() {}
