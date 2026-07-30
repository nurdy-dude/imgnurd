import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { listContainers, pullAndRestartContainer } from './services/docker.js';
import { getSettings, saveSettings } from './services/settings.js';
import { notifier } from './services/notifier.js';
import { initScheduler } from './services/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static frontend dashboard
app.use(express.static(path.join(__dirname, '../public')));

// --- REST API ENDPOINTS ---

// 1. List all Docker Containers
app.get('/api/containers', async (req, res) => {
  try {
    const containers = await listContainers();
    res.json(containers);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve containers', details: err.message });
  }
});

// 2. Trigger Container Update & Restart
app.post('/api/containers/:id/update', async (req, res) => {
  const containerId = req.params.id;
  try {
    const result = await pullAndRestartContainer(containerId);
    
    if (result.success) {
      await notifier.send({
        title: 'Container Updated',
        message: result.message,
        type: 'success',
        containerName: containerId
      });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Get Application Settings
app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

// 4. Save Settings & Re-initialize Scheduler
app.post('/api/settings', (req, res) => {
  try {
    const updated = saveSettings(req.body);
    initScheduler(); // Restart cron job with new schedule dynamically
    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save settings', details: err.message });
  }
});

// 5. Test Webhook / Notification Settings
app.post('/api/settings/test-notification', async (req, res) => {
  try {
    await notifier.send({
      title: 'Test Notification 🤓',
      message: 'If you are reading this, your notification settings are working!',
      type: 'info'
    });
    res.json({ success: true, message: 'Test notification sent!' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to send test notification', details: err.message });
  }
});

// Serve frontend for unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start Server & Initialize Scheduler
app.listen(PORT, () => {
  console.log(`[imgnurd] Server running on port ${PORT}`);
  initScheduler();
});
