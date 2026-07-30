import fs from 'fs';
import path from 'path';

export interface AppSettings {
  cronSchedule: string;
  discordWebhook: string;
  slackWebhook: string;
  gotifyUrl: string;
  gotifyToken: string;
  telegramToken: string;
  telegramChatId: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const defaultSettings: AppSettings = {
  cronSchedule: '0 */6 * * *',
  discordWebhook: '',
  slackWebhook: '',
  gotifyUrl: '',
  gotifyToken: '',
  telegramToken: '',
  telegramChatId: ''
};

export function getSettings(): AppSettings {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(SETTINGS_FILE)) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
      return defaultSettings;
    }
    const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return { ...defaultSettings, ...JSON.parse(data) };
  } catch (err) {
    console.error('[imgnurd] Failed to read settings, using defaults:', err);
    return defaultSettings;
  }
}

export function saveSettings(newSettings: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const updated = { ...current, ...newSettings };
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
  } catch (err) {
    console.error('[imgnurd] Failed to save settings:', err);
  }
  return updated;
}