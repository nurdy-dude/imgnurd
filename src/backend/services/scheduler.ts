import cron, { ScheduledTask } from 'node-cron';
import { listContainers } from './docker.js';
import { notifier } from './notifier.js';
import { getSettings } from './settings.js';

let currentJob: ScheduledTask | null = null;

export function initScheduler() {
  const settings = getSettings();
  const schedule = settings.cronSchedule || '0 */6 * * *';

  if (currentJob) {
    currentJob.stop();
  }

  if (!cron.validate(schedule)) {
    console.error(`[imgnurd] Invalid CRON_SCHEDULE: "${schedule}"`);
    return;
  }

  console.log(`[imgnurd] Scheduler initialized with schedule: "${schedule}"`);

  currentJob = cron.schedule(schedule, async () => {
    console.log('[imgnurd] Running scheduled container check...');
    try {
      const containers = await listContainers();
      
      await notifier.send({
        title: 'Routine Container Check',
        message: `Checked ${containers.length} active containers for image updates.`,
        type: 'info'
      });
    } catch (err: any) {
      console.error('[imgnurd] Scheduled check error:', err.message);
    }
  });
}
