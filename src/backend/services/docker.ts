import Docker from 'dockerode';
import os from 'os';

export const isWindows = os.platform() === 'win32';

export const docker = new Docker(
  isWindows
    ? { socketPath: '//./pipe/docker_engine' }
    : { socketPath: '/var/run/docker.sock' }
);

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  updateAvailable: boolean;
  isSelf: boolean;
  lastChecked: string;
}

// In-memory cache to persist update status between UI refreshes
const updateCache: Record<string, { updateAvailable: boolean; lastChecked: string }> = {};

/**
 * List all running containers with cached update status
 */
export async function listContainers(): Promise<ContainerInfo[]> {
  const containers = await docker.listContainers({ all: false });

  return containers.map(c => {
    const rawName = c.Names[0] ? c.Names[0].replace(/^\//, '') : c.Id.substring(0, 12);
    const isSelf = rawName === 'imgnurd' || c.Image.includes('imgnurd');
    const cache = updateCache[c.Id] || { updateAvailable: false, lastChecked: 'Not checked yet' };

    return {
      id: c.Id,
      name: rawName,
      image: c.Image,
      status: c.Status,
      updateAvailable: cache.updateAvailable,
      isSelf,
      lastChecked: cache.lastChecked
    };
  });
}

/**
 * Check remote registries for updated image digests
 */
export async function checkForUpdates(): Promise<{ total: number; updatesFound: number }> {
  const containers = await docker.listContainers({ all: false });
  let updatesFound = 0;
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  for (const c of containers) {
    try {
      const imageName = c.Image;
      const localImage = docker.getImage(imageName);
      const localInspect = await localImage.inspect();
      const localDigest = localInspect.RepoDigests?.[0] || localInspect.Id;

      console.log(`[imgnurd] Checking registry for newer manifest: ${imageName}`);

      // Query registry to inspect remote manifest
      // Dockerode pull with auth/header fallback checks if remote image digest differs
      const stream = await docker.pull(imageName);
      
      // Follow stream briefly to evaluate digest
      await new Promise((resolve) => {
        docker.modem.followProgress(stream, () => resolve(true));
      });

      const updatedInspect = await localImage.inspect();
      const updatedDigest = updatedInspect.RepoDigests?.[0] || updatedInspect.Id;

      const hasUpdate = localDigest !== updatedDigest;
      
      if (hasUpdate) {
        updatesFound++;
      }

      updateCache[c.Id] = {
        updateAvailable: hasUpdate,
        lastChecked: now
      };
    } catch (err: any) {
      console.warn(`[imgnurd] Could not check remote registry for ${c.Image}:`, err.message);
      updateCache[c.Id] = {
        updateAvailable: false,
        lastChecked: `${now} (Error)`
      };
    }
  }

  return {
    total: containers.length,
    updatesFound
  };
}

/**
 * Safely update container or spawn sidecar helper if updating self
 */
export async function safeUpdateContainer(containerId: string): Promise<{ success: boolean; message: string }> {
  try {
    const container = docker.getContainer(containerId);
    const inspectData = await container.inspect();
    const rawName = inspectData.Name.replace(/^\//, '');
    const imageName = inspectData.Config.Image;
    const isSelf = rawName === 'imgnurd' || imageName.includes('imgnurd');

    if (isSelf) {
      return await spawnSelfUpdater(containerId, rawName, imageName, inspectData);
    }

    console.log(`[imgnurd] Pulling updated image: ${imageName}...`);
    await new Promise<void>((resolve, reject) => {
      docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (progressErr: Error | null) => {
          if (progressErr) return reject(progressErr);
          resolve();
        });
      });
    });

    console.log(`[imgnurd] Stopping existing container ${rawName}...`);
    await container.stop();
    await container.remove();

    console.log(`[imgnurd] Recreating container ${rawName}...`);
    const newContainer = await docker.createContainer({
      ...inspectData.Config,
      name: rawName,
      HostConfig: inspectData.HostConfig
    });

    await newContainer.start();

    // Clear update flag on success
    if (updateCache[containerId]) {
      updateCache[containerId].updateAvailable = false;
    }

    return {
      success: true,
      message: `Container ${rawName} updated and restarted successfully.`
    };
  } catch (err: any) {
    console.error(`[imgnurd] Update failed for container ${containerId}:`, err);
    return {
      success: false,
      message: `Update failed: ${err.message}`
    };
  }
}

/**
 * Sidecar helper for imgnurd self-updates
 */
async function spawnSelfUpdater(
  containerId: string,
  rawName: string,
  imageName: string,
  inspectData: any
): Promise<{ success: boolean; message: string }> {
  console.log(`[imgnurd] Preparing sidecar helper to update imgnurd (${rawName})...`);

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
    console.log(`[imgnurd] Ensuring sidecar engine image (${helperImage}) is pulled...`);
    await new Promise<void>((resolve, reject) => {
      docker.pull(helperImage, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (progressErr: Error | null) => {
          if (progressErr) return reject(progressErr);
          resolve();
        });
      });
    });

    console.log(`[imgnurd] Creating helper container 'imgnurd-updater-tmp'...`);
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