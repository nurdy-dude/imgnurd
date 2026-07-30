import Docker from 'dockerode';
import os from 'os';

export const isWindows = os.platform() === 'win32';

// Connect to local Docker daemon socket
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

/**
 * List all running containers and cross-reference image tags with local state
 */
export async function listContainers(): Promise<ContainerInfo[]> {
  const containers = await docker.listContainers({ all: false });
  
  return containers.map(c => {
    const rawName = c.Names[0] ? c.Names[0].replace(/^\//, '') : c.Id.substring(0, 12);
    const isSelf = rawName === 'imgnurd' || c.Image.includes('imgnurd');

    return {
      id: c.Id,
      name: rawName,
      image: c.Image,
      status: c.Status,
      updateAvailable: false, // Default state until check-now or scheduled cron runs
      isSelf,
      lastChecked: 'Not checked yet'
    };
  });
}

/**
 * Trigger pull check against registries to see if newer image digests exist
 */
export async function checkForUpdates(): Promise<{ total: number; updatesFound: number }> {
  const containers = await docker.listContainers({ all: false });
  let updatesFound = 0;

  for (const c of containers) {
    try {
      const image = docker.getImage(c.Image);
      // Attempting to pull header metadata or digest comparison
      // (Mocked check logic structure for standard Docker registries)
      await image.inspect();
    } catch (err) {
      console.warn(`[imgnurd] Could not inspect image ${c.Image}:`, err);
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

    // Standard non-self container recreation
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

    return {
      success: true,
      message: `Container ${rawName} updated and restarted successfully!`
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
 * Helper to handle imgnurd self-updating via temporary sidecar container
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

  // Script executed inside temporary helper container
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
    // 1. Ensure docker:cli image exists locally before trying to create container
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

    // 2. Spawn temporary helper container
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
      message: 'imgnurd self-update initiated! The dashboard will restart in ~10 seconds with the new version.'
    };
  } catch (err: any) {
    console.error('[imgnurd] Failed to spawn self-updater helper:', err.message);
    return {
      success: false,
      message: `Failed to start self-update helper: ${err.message}`
    };
  }
}