# EcoDev Desktop App

This Electron shell packages the EcoDev web experience as a desktop application and keeps Node integration disabled. It loads the deployed/local EcoDev web URL configured by `ECODEV_WEB_URL`.

## Run locally

1. Start the EcoDev web application on port 5173.
2. Start the desktop companion from `integrations/desktop-agent` on localhost port 17777.
3. In this folder run `npm install` and `npm start`.

Set `ECODEV_WEB_URL` when the web app is hosted somewhere else.

## Laptop Energy Saver connection

The browser dashboard only reads device context when its build has
`VITE_ECODEV_DEVICE_AGENT_URL=http://127.0.0.1:17777/v1/device`. The agent is
localhost-only and the dashboard does not upload its readings. Battery, memory,
load and process context are local measurements when the operating system exposes
them; Linux RAPL package power is not whole-laptop electricity consumption.

For a public HTTPS website, browser mixed-content and localhost policies can
prevent a hosted page from calling an HTTP local agent. The Electron shell is the
reliable opt-in route for that integration. The hosted analyzer works without it.

## Distribution

The source is ready for packaging with Electron Builder, Electron Forge, or an equivalent signed distribution pipeline. A production release should ship platform-specific signed installers for Windows, macOS, and Linux and bundle/configure the desktop agent with explicit consent. Do not auto-start monitoring without a visible user-controlled setting.
