---
name: Browser monitoring boundary
description: The EcoDev browser app cannot inspect all laptop processes or VS Code without a local companion.
---

The web app should be honest about the difference between local browser analysis/demo monitor data and real device-wide process monitoring.

**Why:** Browsers do not have permission to enumerate arbitrary operating-system processes or read VS Code activity, so presenting that as working would mislead users.

**How to apply:** Keep the current web surface useful and local-first, and add real process/IDE monitoring only through a future desktop companion or editor extension with explicit permissions.