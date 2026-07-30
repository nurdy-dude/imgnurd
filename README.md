<div align="center">
  <img src="https://i.ibb.co/szk7dkn/imgnurd.webp" alt="imgnurd Logo" width="160" />
  <h1>img<span style="color: #FFD600;">nurd</span></h1>
  <p><strong>Lightweight, automatic Docker container update manager & notification engine.</strong></p>
</div>

---

## ⚡ Features

- **Automated Registry Scanning:** Periodically checks running Docker container image digests against remote registries.
- **One-Click Container Updates:** Instantly pull, recreate, and restart containers with updated image tags.
- **Multi-Channel Webhook Notifications:** Send update alerts directly to Discord, Slack, Gotify, or Telegram.
- **Self-Management Safe Guard:** Automatically disables direct self-recreation on `imgnurd` to prevent corrupting runtime socket states.
- **Modern Responsive UI:** Dark glassmorphism dashboard themed in signature **Nurdy Yellow (`#FFD600`)**.

---

## 🚀 Quick Start with Docker Compose

Add `imgnurd` to your `docker-compose.yml`:

```yaml
version: '3.8'

services:
  imgnurd:
    image: ghcr.io/${{ github.repository_owner }}/imgnurd:latest
    container_name: imgnurd
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3000

Run to start

```docker compose up -d

Access the dashboard at http://localhost:3000