# EcoDev Desktop Companion

A localhost-only companion for the EcoDev web application. It provides best-effort device context for green-computing recommendations without giving the web browser direct operating-system access.

## Data exposed

`GET /v1/device` reports CPU count/load, memory usage, battery percentage/charging state when the host exposes it, a short list of top processes, and recommendations such as reducing unnecessary background work or using OS power-saving/display-sleep settings during idle periods.

The server binds to `127.0.0.1` only. It does not accept remote connections and does not upload device telemetry by itself.

## Run

```bash
cd integrations/desktop-agent
npm install
npm start
```

Set `ECODEV_AGENT_PORT` to change the localhost port and `ECODEV_AGENT_INTERVAL_MS` to change the sampling interval. The agent uses OS-native commands on Linux, macOS, and Windows and degrades gracefully when a battery/process API is unavailable.

## Production packaging

This source is the OS-monitoring core. A signed Electron/Tauri shell should be used for a distributable GUI installer so the service can be started/stopped by the user and packaged for Windows, macOS, and Linux. Do not silently install or enable background monitoring without explicit user consent.
