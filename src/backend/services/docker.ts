import Docker from 'dockerode';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: number;
}

export async function listContainers(): Promise<ContainerInfo[]> {
  try {
    const containers = await docker.listContainers({ all: true });
    return containers.map((c) => ({
      id: c.Id.substring(0, 12),
      name: c.Names[0]?.replace(/^\//, '') || 'unnamed',
      image: c.Image,
      status: c.Status,
      state: c.State,
      created: c.Created,
    }));
  } catch (err: any) {
    console.error('[imgnurd] Failed to list containers:', err.message);
    throw err;
  }
}

export async function pullAndRestartContainer(containerId: string): Promise<{ success: boolean; message: string }> {
  try {
    const container = docker.getContainer(containerId);
    const inspectData = await container.inspect();
    const imageName = inspectData.Config.Image;

    console.log(`[imgnurd] Pulling latest image for ${imageName}...`);

    // Pull latest image with explicitly typed callback (Error | null)
    await new Promise<void>((resolve, reject) => {
      docker.pull(imageName, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(
          stream,
          (progressErr: Error | null, output: any[]) => {
            if (progressErr) return reject(progressErr);
            resolve();
          }
        );
      });
    });

    console.log(`[imgnurd] Restarting container ${containerId}...`);
    await container.restart();

    return {
      success: true,
      message: `Successfully updated and restarted container ${inspectData.Name.replace(/^\//, '')}`,
    };
  } catch (err: any) {
    console.error(`[imgnurd] Failed to update container ${containerId}:`, err.message);
    return {
      success: false,
      message: err.message || 'Failed to update container',
    };
  }
}
