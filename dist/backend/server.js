"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const docker_1 = require("./services/docker");
const settings_1 = require("./services/settings");
const notifier_1 = require("./services/notifier");
const scheduler_1 = require("./services/scheduler");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use(express_1.default.json());
// Serve static frontend dashboard from public folder
const publicPath = path_1.default.join(__dirname, '../public');
app.use(express_1.default.static(publicPath));
// --- REST API ENDPOINTS ---
app.get('/api/containers', async (req, res) => {
    try {
        const containers = await (0, docker_1.listContainers)();
        res.json(containers);
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to retrieve containers', details: err.message });
    }
});
app.post('/api/containers/:id/update', async (req, res) => {
    try {
        const result = await (0, docker_1.safeUpdateContainer)(req.params.id);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});
app.get('/api/settings', (req, res) => {
    res.json((0, settings_1.getSettings)());
});
app.post('/api/settings', (req, res) => {
    try {
        const updated = (0, settings_1.saveSettings)(req.body);
        (0, scheduler_1.initScheduler)();
        res.json({ success: true, settings: updated });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to save settings', details: err.message });
    }
});
app.post('/api/settings/test-notification', async (req, res) => {
    try {
        await notifier_1.notifier.send({
            title: 'Test Notification 🤓',
            message: 'If you are reading this, your notification settings are working!',
            type: 'info'
        });
        res.json({ success: true, message: 'Test notification sent!' });
    }
    catch (err) {
        res.status(500).json({ error: 'Failed to send test notification', details: err.message });
    }
});
app.get('*', (req, res) => {
    res.sendFile(path_1.default.join(publicPath, 'index.html'));
});
app.listen(PORT, () => {
    console.log(`[imgnurd] Server running on port ${PORT}`);
    (0, scheduler_1.initScheduler)();
});
