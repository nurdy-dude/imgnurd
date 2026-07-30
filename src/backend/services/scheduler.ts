import cron from 'node-cron';
import { listContainers } from './docker.js';
import { notifier } from './notifier.js';

export function initScheduler() {
  const schedule = process.env.CRON_SCHEDULE || '0 */6 * * *'; // Default: Every 6 hours

  if (!cron.validate(schedule)) {
    console.error(`[imgnurd] Invalid CRON_SCHEDULE expression: "${schedule}"`);
    return;
  }

  console.log(`[imgnurd] Scheduler initialized with cron pattern: "${schedule}"`);

  cron.schedule(schedule, async () => {
    console.log('[imgnurd] Running scheduled image update check...');
    try {
      const containers = await listContainers();
      
      // Notify check completed
      await notifier.send({
        title: 'Routine Container Check',
        message: `Checked ${containers.length} containers for base image updates.`,
        type: 'info'
      });

    } catch (err: any) {
      console.error('[imgnurd] Scheduled check error:', err.message);
    }
  });
}