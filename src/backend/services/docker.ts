import Docker from 'dockerode';
import { notifier } from './notifier';

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
  try {
    const container = docker.getContainer(containerId);
    const inspectData = await container.inspect();
    const rawName = inspectData.Name.replace(/^\//, '');
    const imageName = inspectData.Config.Image;

    console.log(`[imgnurd] Pulling fresh image for ${imageName}...`);
    
    await new Promise<void>((resolve, reject) => {
      docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (progressErr: Error | null) => {
          if (progressErr) return reject(progressErr);
          resolve();
        });
      });
    });

    await container.restart();

    await notifier.send({
      title: 'Container Updated',
      message: `Container ${rawName} updated and restarted successfully.`,
      type: 'success',
      containerName: rawName,
      imageName: imageName
    });

    return { success: true, message: `Successfully updated ${rawName}!` };
  } catch (err: any) {
    console.error(`[imgnurd] Update failed for container ${containerId}:`, err.message);
    return { success: false, message: `Failed to update: ${err.message}` };
  }
}