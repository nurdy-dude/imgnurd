import cron, { ScheduledTask } from 'node-cron';
import { checkForUpdates } from './docker';
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
      const result = await checkForUpdates();
      
      if (result.updatesFound > 0) {
        await notifier.send({
          title: 'Container Updates Available 🤓',
          message: `Found ${result.updatesFound} container update(s) ready during scheduled check.`,
          type: 'warning'
        });
      }
    } catch (err: any) {
      console.error('[imgnurd] Scheduled check error:', err.message);
    }
  });
}