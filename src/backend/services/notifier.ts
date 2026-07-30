import { getSettings } from './settings.js';

export interface NotificationPayload {
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  containerName?: string;
  imageName?: string;
}

export class Notifier {
  async send(payload: NotificationPayload) {
    const cfg = getSettings();
    const promises: Promise<any>[] = [];

    if (cfg.discordWebhook) promises.push(this.sendDiscord(cfg.discordWebhook, payload));
    if (cfg.slackWebhook) promises.push(this.sendSlack(cfg.slackWebhook, payload));
    if (cfg.gotifyUrl && cfg.gotifyToken) promises.push(this.sendGotify(cfg.gotifyUrl, cfg.gotifyToken, payload));
    if (cfg.telegramToken && cfg.telegramChatId) promises.push(this.sendTelegram(cfg.telegramToken, cfg.telegramChatId, payload));

    await Promise.allSettled(promises);
  }

  private async sendDiscord(webhookUrl: string, p: NotificationPayload) {
    const colorMap = { info: 0x3b82f6, success: 0x10b981, warning: 0xf59e0b, error: 0xef4444 };
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'imgnurd 🤓',
        embeds: [{
          title: p.title,
          description: p.message,
          color: colorMap[p.type],
          fields: p.containerName ? [
            { name: 'Container', value: p.containerName, inline: true },
            { name: 'Image', value: p.imageName || 'N/A', inline: true }
          ] : [],
          timestamp: new Date().toISOString()
        }]
      })
    });
  }

  private async sendSlack(webhookUrl: string, p: NotificationPayload) {
    const emojiMap = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '🚨' };
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${emojiMap[p.type]} *${p.title}*\n${p.message}${p.containerName ? `\n> *Container:* ${p.containerName}` : ''}`
      })
    });
  }

  private async sendGotify(baseUrl: string, token: string, p: NotificationPayload) {
    const priorityMap = { info: 2, success: 5, warning: 7, error: 10 };
    const url = `${baseUrl.replace(/\/$/, '')}/message?token=${token}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `🤓 imgnurd: ${p.title}`,
        message: `${p.message}${p.containerName ? `\nContainer: ${p.containerName}` : ''}`,
        priority: priorityMap[p.type]
      })
    });
  }

  private async sendTelegram(token: string, chatId: string, p: NotificationPayload) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const text = `🤓 *imgnurd: ${p.title}*\n\n${p.message}${p.containerName ? `\n*Container:* \`${p.containerName}\`` : ''}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
  }
}

export const notifier = new Notifier();