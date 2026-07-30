import { notifier } from './notifier.js';
import Docker from 'dockerode';

// Cross-platform Docker socket detection (Windows named pipe vs Linux socket)
const isWindows = process.platform === 'win32';
export const docker = new Docker(
  isWindows
    ? { socketPath: '//./pipe/docker_engine' }
    : { socketPath: '/var/run/docker.sock' }
);

export interface ContainerStatus {
  id: string;
  name: string;
  image: string;
  status: string;
  health: string;
  created: number;
}

/**
 * List all running containers with their current state
 */
export async function listContainers(): Promise<ContainerStatus[]> {
  const containers = await docker.listContainers({ all: true });
  
  return containers.map(c => ({
    id: c.Id.substring(0, 12),
    name: c.Names[0].replace(/^\//, ''),
    image: c.Image,
    status: c.State,
    health: c.Status.includes('(healthy)') ? 'healthy' : c.Status.includes('(unhealthy)') ? 'unhealthy' : 'n/a',
    created: c.Created
  }));
}

/**
 * Backup current image, pull latest, and redeploy container safely
 */
export async function safeUpdateContainer(containerId: string): Promise<{ success: boolean; message: string }> {
  const container = docker.getContainer(containerId);
  const inspectData = await container.inspect();
  const rawName = inspectData.Name.replace(/^\//, '');
  const imageName = inspectData.Config.Image;

  // 1. Tag backup image
  const backupTag = `${imageName}:imgnurd-backup`;
  try {
    const currentImg = docker.getImage(inspectData.Image);
    await currentImg.tag({ repo: imageName, tag: 'imgnurd-backup' });
  } catch (err) {
    console.warn(`[imgnurd] Could not tag backup for ${rawName}:`, err);
  }

  // 2. Pull new image
  console.log(`[imgnurd] Pulling fresh image for ${imageName}...`);
  await new Promise((resolve, reject) => {
    docker.pull(imageName, (err: Error, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, onFinished);
      function onFinished(err: Error, output: any) {
        if (err) return reject(err);
        resolve(output);
      }
    });
  });

  // 3. Stop & Rename existing container
  console.log(`[imgnurd] Stopping existing container ${rawName}...`);
  await container.stop();
  await container.rename({ name: `${rawName}-old` });

  try {
    // 4. Instantiate new container with matching config
    console.log(`[imgnurd] Creating new instance of ${rawName}...`);
    const newContainer = await docker.createContainer({
      ...inspectData.Config,
      HostConfig: inspectData.HostConfig,
      NetworkingConfig: { EndpointsConfig: inspectData.NetworkSettings.Networks },
      name: rawName
    });

    await newContainer.start();

    // 5. Cleanup old instance
    await container.remove();

    // Send success notification
    await notifier.send({
      title: 'Container Updated Successfully',
      message: `Container ${rawName} has been updated to the latest image and restarted safely.`,
      type: 'success',
      containerName: rawName,
      imageName: imageName
    });

    return { success: true, message: `Successfully updated ${rawName}!` };

  } catch (err: any) {
    // 6. Rollback procedure on failure
    console.error(`[imgnurd] Update failed for ${rawName}, rolling back:`, err.message);
    await container.rename({ name: rawName });
    await container.start();

    // Send failure notification
    await notifier.send({
      title: 'Container Update Failed (Rolled Back)',
      message: `Failed to update ${rawName}: ${err.message}. The previous version was restored.`,
      type: 'error',
      containerName: rawName,
      imageName: imageName
    });

    return { success: false, message: `Failed to update: ${err.message}. Container rolled back.` };
  }
}