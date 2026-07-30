# 🤓 imgnurd

A lightweight container image update manager with an automated rollback engine, live container logs, and webhook notifications.

## Features
- 🔄 **Safe Updates:** Tags backup images before pulling new versions; auto-rolls back if the new container fails to start.
- ⏱️ **Scheduled Checks:** Intermittent checks using customizable cron expressions.
- 🔔 **Multi-Platform Alerts:** Built-in webhooks for Discord, Slack, Gotify, and Telegram.
- 📜 **Live Logs:** Stream container logs directly in the web UI via WebSockets.
- ⚙️ **Zero DB Needed:** All settings are stored in a simple JSON file inside a mounted volume.

## Quick Start with Docker Compose

```yaml
version: '3.8'

services:
  imgnurd:
    image: ghcr.io/nurdy-dude/imgnurd:latest
    container_name: imgnurd
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - imgnurd-data:/app/data

volumes:
  imgnurd-data:
