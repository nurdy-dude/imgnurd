<div align="center">
  <img src="https://i.ibb.co/szk7dkn/imgnurd.webp" alt="imgnurd Logo" width="300" />
  <p><strong>Lightweight, automatic Docker container update manager & notification engine.</strong></p>
</div>

---

<img width="1360" height="918" alt="dashboard" src="https://github.com/user-attachments/assets/40fd8ef9-61b3-4921-a62a-e27bc1056f90" />

---

## ⚡ Features

- **Real-Time Container Overview:** Monitor container status, health, ports, and image tags.
- **Remote Registry Checking:** Compares running container image SHA256 digests against remote upstream tags to detect updates accurately.
- **One-Click Updates:** Safely pull new images, stop old containers, and recreate them with identical port mappings and volume bindings intact.
- **Sidecar Self-Updater:** Updates `imgnurd` seamlessly without dropping environment configurations or volume mounts using a temporary sidecar agent.
- **Discord & Webhook Notifications:** Receive real-time alerts whenever a container update is triggered or completed.
- **Lightweight & Fast:** Built with React (Vite/Tailwind) on the frontend and Express/Dockerode on the backend.

---

## 🚀 Quick Start

### Option 1: Docker Compose (Recommended)

Create a `docker-compose.yml` file on your server:

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
    environment:
      - NODE_ENV=production
      - PORT=3000

volumes:
  imgnurd-data:
    name: imgnurd-data
```

Run compose to start

```
docker compose up -d
```

Access the dashboard at http://localhost:3000

### Option 2: Docker CLI

```
docker run -d \
  --name imgnurd \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v imgnurd-data:/app/data \
  -e NODE_ENV=production \
  ghcr.io/nurdy-dude/imgnurd:latest
```
---

## ⚙️ Environment Variables & Configuration

| **Variable**      | **Default**             | **Description**                                  |
|-------------------|-------------------------|--------------------------------------------------|
| **PORT**          | 3000                    | Port on which the imgnurd web interface listens. |
| **NODE_ENV**      | production              | Set to production for container deployments.     |
| **SETTINGS_PATH** | /app/data/settings.json | Path to persistent user configuration file.      |

---

## 🛠️ How Self-Updates Work

Updating a running container from within itself is traditionally tricky because stopping the container kills the process managing the update.

imgnurd solves this using an automated sidecar helper:
1. When you click Update Self, imgnurd spawns a temporary sidecar container (imgnurd-updater-tmp) using docker:cli.
2. The sidecar inherits the host's Docker socket and volume bindings.
3. Once running, the sidecar pulls the latest imgnurd:latest image, stops and removes the old imgnurd container, and recreates it with identical flags and ports.
4. The sidecar automatically removes itself (--rm) upon completion.

---

## 💻 Local Development Setup

If you want to contribute or build imgnurd locally:

Prerequisites:
- Node.js 18+
- Docker Desktop or Docker Engine running locally

### Installation
1. Clone the repository:
```
git clone [https://github.com/nurdy-dude/imgnurd.git](https://github.com/nurdy-dude/imgnurd.git)
cd imgnurd
```
2. Install dependencies:
```
npm install
```
3. Start development server (Frontend + Backend concurrently):
```
npm run dev
```
4. Build for production:
```
npm run build
```

---

## 📄 License
Distributed under the MIT License. See LICENSE for more information.



