# EcoDev Desktop App

This Electron shell packages the EcoDev web experience as a desktop application and keeps Node integration disabled. It loads the deployed/local EcoDev web URL configured by `ECODEV_WEB_URL`.

## Run locally

1. Start the EcoDev web application on port 5173.
2. Start the desktop companion from `integrations/desktop-agent` on localhost port 17777.
3. In this folder run `npm install` and `npm start`.

Set `ECODEV_WEB_URL` when the web app is hosted somewhere else.

## Distribution

The source is ready for packaging with Electron Builder, Electron Forge, or an equivalent signed distribution pipeline. A production release should ship platform-specific signed installers for Windows, macOS, and Linux and bundle/configure the desktop agent with explicit consent. Do not auto-start monitoring without a visible user-controlled setting.
