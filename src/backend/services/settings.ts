import fs from 'fs';
import path from 'path';

export interface AppSettings {
  cronSchedule: string;
  discordWebhook?: string;
  slackWebhook?: string;
  gotifyUrl?: string;
  gotifyToken?: string;
  telegramToken?: string;
  telegramChatId?: string;
}

const defaultSettings: AppSettings = {
  cronSchedule: '0 */6 * * *',
  discordWebhook: '',
  slackWebhook: '',
  gotifyUrl: '',
  gotifyToken: '',
  telegramToken: '',
  telegramChatId: ''
};

// Ensure data directory exists inside container or root (/app/data)
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const settingsFilePath = path.join(dataDir, 'settings.json');

export function getSettings(): AppSettings {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const rawData = fs.readFileSync(settingsFilePath, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(rawData) };
    }
  } catch (err) {
    console.error('[imgnurd] Error reading settings.json:', err);
  }
  return defaultSettings;
}

export function saveSettings(newSettings: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const updated = { ...current, ...newSettings };

  try {
    fs.writeFileSync(settingsFilePath, JSON.stringify(updated, null, 2), 'utf-8');
    console.log('[imgnurd] Settings saved successfully to persistence storage.');
  } catch (err) {
    console.error('[imgnurd] Error saving settings.json:', err);
  }

  return updated;
}