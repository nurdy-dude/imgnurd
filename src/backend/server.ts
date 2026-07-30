import { getSettings, saveSettings } from './services/settings.js';
import { notifier } from './services/notifier.js';

// Get Current UI Settings
app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

// Update UI Settings & Reload Cron
app.post('/api/settings', (req, res) => {
  const updated = saveSettings(req.body);
  initScheduler(); // Restart cron with new schedule
  res.json({ success: true, settings: updated });
});

// Test Notification Endpoint
app.post('/api/settings/test-notification', async (req, res) => {
  try {
    await notifier.send({
      title: 'Test Alert 🧪',
      message: 'Notifications are working properly on imgnurd!',
      type: 'info'
    });
    res.json({ success: true, message: 'Test notification sent successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
