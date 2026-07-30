import Docker from 'dockerode';
import os from 'os';
import { notifier } from './notifier';

export const isWindows = os.platform() === 'win32';

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

// In-memory cache to maintain update flags between UI refreshes
const updateCache = new Map<string, { updateAvailable: boolean; checkedAt: string }>();

/**
 * Lists active containers with their current update status.
 */
export async function listContainers(): Promise<ContainerStatus[]> {
  const containers = await docker.listContainers({ all: false });

  return containers.map(c => {
    const id = c.Id.substring(0, 12);
    const cached = updateCache.get(c.Id);
    const rawName = c.Names[0] ? c.Names[0].replace(/^\//, '') : 'unnamed';
    const imageName = c.Image;

    const isSelf = rawName.toLowerCase() === 'imgnurd' || imageName.toLowerCase().includes('imgnurd');

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

/**
 * Pulls the latest image manifest from remote registries and compares 
 * the running container's Image ID against the newly pulled Image ID.
 */
export async function checkForUpdates(): Promise<{ total: number; updatesFound: number }> {
  const containers = await docker.listContainers({ all: false });
  let updatesFound = 0;
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  for (const c of containers) {
    try {
      const imageName = c.Image;
      const containerObj = docker.getContainer(c.Id);
      const containerInspect = await containerObj.inspect();
      const currentRunningImageId = containerInspect.Image; // The actual SHA256 image ID currently running

      console.log(`[imgnurd] Pulling latest tag for ${imageName}...`);

      // Force Docker engine to pull the latest tag from remote registry (GHCR, Docker Hub, etc.)
      await new Promise<void>((resolve, reject) => {
        docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (progressErr: Error | null) => {
            if (progressErr) return reject(progressErr);
            resolve();
          });
        });
      });

      // Get inspect details of the freshly pulled image tag
      const latestImageObj = docker.getImage(imageName);
      const latestImageInspect = await latestImageObj.inspect();
      const latestImageId = latestImageInspect.Id;

      // If running image ID != newly pulled image ID, an update is available!
      const hasUpdate = currentRunningImageId !== latestImageId;

      if (hasUpdate) {
        updatesFound++;
        console.log(`[imgnurd] Update detected for ${c.Names[0]}: Running=${currentRunningImageId.substring(0, 12)} vs Latest=${latestImageId.substring(0, 12)}`);
      }

      updateCache.set(c.Id, {
        updateAvailable: hasUpdate,
        checkedAt: now
      });
    } catch (err: any) {
      console.warn(`[imgnurd] Could not check registry for ${c.Image}:`, err.message);
      updateCache.set(c.Id, {
        updateAvailable: false,
        checkedAt: `${now} (Error)`
      });
    }
  }

  return {
    total: containers.length,
    updatesFound
  };
}

/**
 * Handles standard container recreation or delegates self-updates to a sidecar container.
 */
export async function safeUpdateContainer(containerId: string): Promise<{ success: boolean; message: string }> {
  try {
    const container = docker.getContainer(containerId);
    const inspectData = await container.inspect();
    const rawName = inspectData.Name.replace(/^\//, '');
    const imageName = inspectData.Config.Image;
    const isSelf = rawName.toLowerCase() === 'imgnurd' || imageName.toLowerCase().includes('imgnurd');

    if (isSelf) {
      return await spawnSelfUpdater(containerId, rawName, imageName, inspectData);
    }

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

    // Reset update status in cache
    updateCache.set(inspectData.Id, {
      updateAvailable: false,
      checkedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    await notifier.send({
      title: 'Container Updated',
      message: `Container ${rawName} was successfully recreated using the latest ${imageName} image.`,
      type: 'success',
      containerName: rawName,
      imageName: imageName
    });

    return { success: true, message: `Successfully updated and recreated ${rawName}.` };
  } catch (err: any) {
    console.error(`[imgnurd] Update failed for container ${containerId}:`, err.message);
    return { success: false, message: `Failed to update: ${err.message}` };
  }
}

/**
 * Spawns a temporary docker:cli sidecar helper to update imgnurd itself.
 */
async function spawnSelfUpdater(
  containerId: string,
  rawName: string,
  imageName: string,
  inspectData: any
): Promise<{ success: boolean; message: string }> {
  console.log(`[imgnurd] Spawning sidecar helper to update imgnurd (${rawName})...`);

  const socketBinding = isWindows
    ? '//./pipe/docker_engine://./pipe/docker_engine'
    : '/var/run/docker.sock:/var/run/docker.sock';
  const helperImage = 'docker:cli';

  const updateScript = `
    echo "[imgnurd-updater] Waiting for main container to stop..."
    sleep 3
    echo "[imgnurd-updater] Pulling latest image: ${imageName}..."
    docker pull ${imageName}
    echo "[imgnurd-updater] Stopping old container..."
    docker stop ${rawName} || true
    echo "[imgnurd-updater] Removing old container..."
    docker rm ${rawName} || true
    echo "[imgnurd-updater] Starting new imgnurd container..."
    docker run -d --name ${rawName} --restart=always -v /var/run/docker.sock:/var/run/docker.sock -p 3000:3000 ${imageName}
    echo "[imgnurd-updater] Update complete! Cleaning up self..."
  `;

  try {
    console.log(`[imgnurd] Ensuring helper container engine image (${helperImage}) is ready...`);
    await new Promise<void>((resolve, reject) => {
      docker.pull(helperImage, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (progressErr: Error | null) => {
          if (progressErr) return reject(progressErr);
          resolve();
        });
      });
    });

    const helperContainer = await docker.createContainer({
      Image: helperImage,
      name: 'imgnurd-updater-tmp',
      Cmd: ['sh', '-c', updateScript],
      HostConfig: {
        Binds: [socketBinding],
        AutoRemove: true
      }
    });

    await helperContainer.start();

    return {
      success: true,
      message: 'Self-update initiated. The dashboard will restart in approximately 10 seconds with the new build.'
    };
  } catch (err: any) {
    console.error('[imgnurd] Failed to spawn self-updater helper:', err.message);
    return {
      success: false,
      message: `Failed to start self-update helper: ${err.message}`
    };
  }
}