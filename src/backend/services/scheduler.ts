import cron, { ScheduledTask } from 'node-cron';
import { listContainers } from './docker';
import { notifier } from './notifier';
import { getSettings } from './settings';

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
    console.log('[imgnurd] Executing scheduled container scan...');
    try {
      const containers = await listContainers();
      
      await notifier.send({
        title: 'Routine Container Check',
        message: `Checked ${containers.length} active containers for updates.`,
        type: 'info'
      });
    } catch (err: any) {
      console.error('[imgnurd] Scheduled check error:', err.message);
    }
  });
}