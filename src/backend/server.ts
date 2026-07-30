import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

// Internal Services
import { initScheduler } from './services/scheduler.js';
import { docker, listContainers, safeUpdateContainer } from './services/docker.js';
import { getSettings, saveSettings } from './services/settings.js';
import { notifier } from './services/notifier.js';

// Recreate __dirname for ESM context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
// Serves static files from the public folder
app.use(express.static(path.join(__dirname, '../public')));

/* ==========================================================================
   Container REST APIs
   ========================================================================== */

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

/* ==========================================================================
   Settings & Notifications REST APIs
   ========================================================================== */

app.get('/api/settings', (req, res) => {
  try {
    const settings = getSettings();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const updated = saveSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings/test-notification', async (req, res) => {
  try {
    await notifier.send({
      title: 'Test Notification',
      message: 'If you are seeing this, imgnurd alerts are configured correctly! 🤓',
      type: 'info'
    });
    res.json({ success: true, message: 'Test notification dispatched successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ==========================================================================
   Real-Time Logs (WebSocket Engine)
   ========================================================================== */

wss.on('connection', (ws, req) => {
  const urlParams = new URLSearchParams(req.url?.split('?')[1]);
  const containerId = urlParams.get('containerId');

  if (!containerId) {
    ws.close(1008, 'containerId parameter required');
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
      ws.send('Error attaching to container log stream.');
      return;
    }

    stream.on('data', chunk => {
      ws.send(chunk.toString('utf-8'));
    });

    ws.on('close', () => {
      // Stream auto-destroys on socket disconnect
    });
  });
});

/* ==========================================================================
   Start Server & Cron Scheduler
   ========================================================================== */

const PORT = process.env.PORT || 3000;

initScheduler();

server.listen(PORT, () => {
  console.log(`🤓 imgnurd is running at http://localhost:${PORT}`);
});