"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettings = getSettings;
exports.saveSettings = saveSettings;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.join(process.cwd(), 'data');
const SETTINGS_FILE = path_1.default.join(DATA_DIR, 'settings.json');
const defaultSettings = {
    cronSchedule: '0 */6 * * *',
    discordWebhook: '',
    slackWebhook: '',
    gotifyUrl: '',
    gotifyToken: '',
    telegramToken: '',
    telegramChatId: ''
};
function getSettings() {
    try {
        if (!fs_1.default.existsSync(DATA_DIR)) {
            fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (!fs_1.default.existsSync(SETTINGS_FILE)) {
            fs_1.default.writeFileSync(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
            return defaultSettings;
        }
        const data = fs_1.default.readFileSync(SETTINGS_FILE, 'utf-8');
        return { ...defaultSettings, ...JSON.parse(data) };
    }
    catch (err) {
        console.error('[imgnurd] Failed to read settings, using defaults:', err);
        return defaultSettings;
    }
}
function saveSettings(newSettings) {
    const current = getSettings();
    const updated = { ...current, ...newSettings };
    try {
        if (!fs_1.default.existsSync(DATA_DIR)) {
            fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs_1.default.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
    }
    catch (err) {
        console.error('[imgnurd] Failed to save settings:', err);
    }
    return updated;
}
