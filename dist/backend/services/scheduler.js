"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initScheduler = initScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const docker_1 = require("./docker");
const notifier_1 = require("./notifier");
const settings_1 = require("./settings");
let currentJob = null;
function initScheduler() {
    const settings = (0, settings_1.getSettings)();
    const schedule = settings.cronSchedule || '0 */6 * * *';
    if (currentJob) {
        currentJob.stop();
    }
    if (!node_cron_1.default.validate(schedule)) {
        console.error(`[imgnurd] Invalid CRON_SCHEDULE: "${schedule}"`);
        return;
    }
    console.log(`[imgnurd] Scheduler initialized with schedule: "${schedule}"`);
    currentJob = node_cron_1.default.schedule(schedule, async () => {
        console.log('[imgnurd] Executing scheduled container scan...');
        try {
            const containers = await (0, docker_1.listContainers)();
            await notifier_1.notifier.send({
                title: 'Routine Container Check',
                message: `Checked ${containers.length} active containers for updates.`,
                type: 'info'
            });
        }
        catch (err) {
            console.error('[imgnurd] Scheduled check error:', err.message);
        }
    });
}
