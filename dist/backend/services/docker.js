"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.docker = void 0;
exports.listContainers = listContainers;
exports.safeUpdateContainer = safeUpdateContainer;
const dockerode_1 = __importDefault(require("dockerode"));
const notifier_1 = require("./notifier");
const isWindows = process.platform === 'win32';
exports.docker = new dockerode_1.default(isWindows
    ? { socketPath: '//./pipe/docker_engine' }
    : { socketPath: '/var/run/docker.sock' });
async function listContainers() {
    const containers = await exports.docker.listContainers({ all: true });
    return containers.map(c => ({
        id: c.Id.substring(0, 12),
        name: c.Names[0] ? c.Names[0].replace(/^\//, '') : 'unnamed',
        image: c.Image,
        status: c.State,
        health: c.Status.includes('(healthy)') ? 'healthy' : c.Status.includes('(unhealthy)') ? 'unhealthy' : 'n/a',
        created: c.Created
    }));
}
async function safeUpdateContainer(containerId) {
    try {
        const container = exports.docker.getContainer(containerId);
        const inspectData = await container.inspect();
        const rawName = inspectData.Name.replace(/^\//, '');
        const imageName = inspectData.Config.Image;
        console.log(`[imgnurd] Pulling fresh image for ${imageName}...`);
        await new Promise((resolve, reject) => {
            exports.docker.pull(imageName, (err, stream) => {
                if (err)
                    return reject(err);
                exports.docker.modem.followProgress(stream, (progressErr) => {
                    if (progressErr)
                        return reject(progressErr);
                    resolve();
                });
            });
        });
        await container.restart();
        await notifier_1.notifier.send({
            title: 'Container Updated',
            message: `Container ${rawName} updated and restarted successfully.`,
            type: 'success',
            containerName: rawName,
            imageName: imageName
        });
        return { success: true, message: `Successfully updated ${rawName}!` };
    }
    catch (err) {
        console.error(`[imgnurd] Update failed for container ${containerId}:`, err.message);
        return { success: false, message: `Failed to update: ${err.message}` };
    }
}
