import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

import { docker, listContainers, safeUpdateContainer } from './services/docker.js';
import { initScheduler } from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// Serve static frontend files from 'public' directory
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// API Routes
app.get('/api/containers', async (req, res) => {
  try {
    const containers = await listContainers();
    res.json(containers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/containers/:id/update', async (req, res) => {
  try {
    const result = await safeUpdateContainer(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// WebSocket Stream for Live Logs
wss.on('connection', (ws, req) => {
  const urlParams = new URLSearchParams(req.url?.split('?')[1]);
  const containerId = urlParams.get('containerId');

  if (!containerId) {
    ws.close(1008, 'containerId required');
    return;
  }

  const container = docker.getContainer(containerId);
  container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 100
  }, (err, stream) => {
    if (err || !stream) {
      ws.send('Error accessing logs from Docker daemon.');
      return;
    }

    if ('on' in stream) {
      stream.on('data', (chunk: Buffer) => {
        ws.send(chunk.toString('utf-8'));
      });
    }

    ws.on('close', () => {
      // Socket automatically stops streaming on disconnect
    });
  });
});

// Start Cron Scheduler
initScheduler();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🤓 imgnurd is running at http://localhost:${PORT}`);
});
