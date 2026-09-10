# EcoDev Green Code Analyzer for VS Code

EcoDev can analyze the file or selection you are working on in VS Code and report algorithmic complexity, hotspots, runtime/memory measurements when execution is enabled and sandboxed, plus green optimization trade-offs.

## Supported languages

JavaScript, TypeScript, Python, C, C++, and Go.

## Install for local development

```bash
cd integrations/vscode
npm install
npm run compile
```

Then open this folder in VS Code and press `F5` to launch an Extension Development Host.

## Configuration

Set `ecodev.endpoint` to your EcoDev API endpoint. Keep `ecodev.analyzeOnSave` disabled unless you explicitly want source sent to that endpoint after each save. `ecodev.executeCode` is opt-in and should only be enabled when the API is configured with an isolated sandbox.

Optimization profiles: `balanced`, `fast`, `memory`, `green`, `reliable`, `secure`, `scalable`.

EcoDev never claims estimated energy/carbon as directly measured. The extension surfaces the API's measured/estimated labels unchanged.
