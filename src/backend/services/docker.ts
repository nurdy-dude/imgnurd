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
  updateAvailable: boolean;
  lastChecked?: string;
  isSelf: boolean;
}

const updateCache = new Map<string, { updateAvailable: boolean; checkedAt: string }>();

export async function listContainers(): Promise<ContainerStatus[]> {
  const containers = await docker.listContainers({ all: true });
  
  return containers.map(c => {
    const id = c.Id.substring(0, 12);
    const cached = updateCache.get(id);
    const rawName = c.Names[0] ? c.Names[0].replace(/^\//, '') : 'unnamed';
    const imageName = c.Image;

    const isSelf = rawName.toLowerCase().includes('imgnurd') || imageName.toLowerCase().includes('imgnurd');

    return {
      id,
      name: rawName,
      image: imageName,
      status: c.State,
      health: c.Status.includes('(healthy)') ? 'healthy' : c.Status.includes('(unhealthy)') ? 'unhealthy' : 'n/a',
      created: c.Created,
      updateAvailable: cached ? cached.updateAvailable : false,
      lastChecked: cached ? cached.checkedAt : 'Not checked yet',
      isSelf
    };
  });
}

export async function checkForUpdates(): Promise<{ total: number; updatesFound: number }> {
  const containers = await docker.listContainers();
  let updatesFound = 0;
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  for (const c of containers) {
    const id = c.Id.substring(0, 12);
    const imageName = c.Image;

    try {
      const imageInfo = await docker.getImage(imageName).inspect();
      const localRepoDigests = imageInfo.RepoDigests || [];

      const manifest = await docker.getImage(imageName).distribution();
      const remoteDigest = manifest.Descriptor?.digest;

      let hasUpdate = false;
      if (remoteDigest && localRepoDigests.length > 0) {
        hasUpdate = !localRepoDigests.some((digest: string) => digest.includes(remoteDigest));
      }

      if (hasUpdate) updatesFound++;

      updateCache.set(id, {
        updateAvailable: hasUpdate,
        checkedAt: now
      });
    } catch (err) {
      updateCache.set(id, {
        updateAvailable: false,
        checkedAt: now
      });
    }
  }

  return { total: containers.length, updatesFound };
}

export async function safeUpdateContainer(containerId: string): Promise<{ success: boolean; message: string }> {
  try {
    const container = docker.getContainer(containerId);
    const inspectData = await container.inspect();
    const rawName = inspectData.Name.replace(/^\//, '');
    const imageName = inspectData.Config.Image;

    if (rawName.toLowerCase().includes('imgnurd') || imageName.toLowerCase().includes('imgnurd')) {
      return {
        success: false,
        message: 'imgnurd cannot update itself directly. Please use Portainer or docker-compose.'
      };
    }

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

    console.log(`[imgnurd] Recreating container ${rawName}...`);

    const containerConfig = {
      ...inspectData.Config,
      HostConfig: inspectData.HostConfig,
      NetworkingConfig: {
        EndpointsConfig: inspectData.NetworkSettings.Networks
      },
      name: rawName
    };

    await container.stop();
    await container.remove();

    const newContainer = await docker.createContainer(containerConfig);
    await newContainer.start();

    updateCache.set(containerId.substring(0, 12), {
      updateAvailable: false,
      checkedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    await notifier.send({
      title: 'Container Updated & Recreated',
      message: `Container ${rawName} was successfully recreated using the latest ${imageName} image.`,
      type: 'success',
      containerName: rawName,
      imageName: imageName
    });

    return { success: true, message: `Successfully updated and recreated ${rawName}!` };
  } catch (err: any) {
    console.error(`[imgnurd] Update failed for container ${containerId}:`, err.message);
    return { success: false, message: `Failed to update: ${err.message}` };
  }
}