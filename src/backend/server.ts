import express from 'express';
import path from 'path';
import { listContainers, safeUpdateContainer, checkForUpdates, docker } from './services/docker';
import { getSettings, saveSettings } from './services/settings';
import { notifier } from './services/notifier';
import { initScheduler } from './services/scheduler';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// REST API ENDPOINTS

app.get('/api/containers', async (req, res) => {
  try {
    const containers = await listContainers();
    res.json(containers);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve containers', details: err.message });
  }
});

app.post('/api/containers/check-now', async (req, res) => {
  try {
    const result = await checkForUpdates();
    res.json({
      success: true,
      message: `Check complete! ${result.updatesFound} update(s) found across ${result.total} containers.`,
      result
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to run image check', details: err.message });
  }
});

app.post('/api/containers/:id/update', async (req, res) => {
  try {
    const result = await safeUpdateContainer(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/containers/:id/logs', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const logsBuffer = await container.logs({
      stdout: true,
      stderr: true,
      tail: 100,
      timestamps: false
    });

    const logsText = typeof logsBuffer === 'string' 
      ? logsBuffer 
      : logsBuffer.toString('utf-8').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

    res.json({ logs: logsText || 'No logs recorded.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch container logs', details: err.message });
  }
});

app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

app.post('/api/settings', (req, res) => {
  try {
    const updated = saveSettings(req.body);
    initScheduler();
    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save settings', details: err.message });
  }
});

app.post('/api/settings/test-notification', async (req, res) => {
  try {
    await notifier.send({
      title: 'Test Notification',
      message: 'Notification system configuration verified successfully.',
      type: 'info'
    });
    res.json({ success: true, message: 'Test notification sent.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to send test notification', details: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[imgnurd] Server running on port ${PORT}`);
  initScheduler();
});