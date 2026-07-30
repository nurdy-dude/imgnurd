import cron from 'node-cron';
import { listContainers } from './docker.js';
import { notifier } from './notifier.js';

export function initScheduler() {
  const schedule = process.env.CRON_SCHEDULE || '0 */6 * * *';

  if (!cron.validate(schedule)) {
    console.error(`[imgnurd] Invalid CRON_SCHEDULE: "${schedule}"`);
    return;
  }

  console.log(`[imgnurd] Scheduler initialized with schedule: "${schedule}"`);

  cron.schedule(schedule, async () => {
    console.log('[imgnurd] Executing scheduled container scan...');
    try {
      const containers = await listContainers();
      
      await notifier.send({
        title: 'Routine Container Scan',
        message: `Scanned ${containers.length} active containers for image updates.`,
        type: 'info'
      });
    } catch (err: any) {
      console.error('[imgnurd] Scheduled check error:', err.message);
    }
  });
}
