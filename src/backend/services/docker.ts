import Docker from 'dockerode';
import { notifier } from './notifier.js';

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

export async function listContainers(): Promise<ContainerStatus[]> {
  const containers = await docker.listContainers({ all: true });
  
  return containers.map(c => ({
    id: c.Id.substring(0, 12),
    name: c.Names[0] ? c.Names[0].replace(/^\//, '') : 'unnamed',
    image: c.Image,
    status: c.State,
    health: c.Status.includes('(healthy)') ? 'healthy' : c.Status.includes('(unhealthy)') ? 'unhealthy' : 'n/a',
    created: c.Created
  }));
}

export async function safeUpdateContainer(containerId: string): Promise<{ success: boolean; message: string }> {
  const container = docker.getContainer(containerId);
  const inspectData = await container.inspect();
  const rawName = inspectData.Name.replace(/^\//, '');
  const imageName = inspectData.Config.Image;

  // Tag current image as backup
  try {
    const currentImg = docker.getImage(inspectData.Image);
    await currentImg.tag({ repo: imageName, tag: 'imgnurd-backup' });
  } catch (err) {
    console.warn(`[imgnurd] Backup tag skipped for ${rawName}:`, err);
  }

  // Pull latest image
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

  // Stop & rename old container
  await container.stop();
  await container.rename({ name: `${rawName}-old` });

  try {
    // Re-create new container with identical configuration
    const newContainer = await docker.createContainer({
      ...inspectData.Config,
      HostConfig: inspectData.HostConfig,
      NetworkingConfig: { EndpointsConfig: inspectData.NetworkSettings.Networks },
      name: rawName
    });

    await newContainer.start();
    await container.remove();

    await notifier.send({
      title: 'Container Updated Successfully',
      message: `Container ${rawName} updated to the latest image and restarted safely.`,
      type: 'success',
      containerName: rawName,
      imageName: imageName
    });

    return { success: true, message: `Successfully updated ${rawName}!` };

  } catch (err: any) {
    // Rollback procedure
    console.error(`[imgnurd] Update failed for ${rawName}, rolling back:`, err.message);
    await container.rename({ name: rawName });
    await container.start();

    await notifier.send({
      title: 'Container Update Failed',
      message: `Failed to update ${rawName}: ${err.message}. Restored previous version.`,
      type: 'error',
      containerName: rawName,
      imageName: imageName
    });

    return { success: false, message: `Failed to update: ${err.message}. Rolled back.` };
  }
}
