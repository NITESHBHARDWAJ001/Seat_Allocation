import { settingsRepository } from './repositories.js';

export interface SyncSettings {
  enabled: boolean;
  backendUrl: string;
  lastSyncedAt?: string;
}

const KEY = 'syncSettings';
const DEFAULTS: SyncSettings = { enabled: false, backendUrl: 'http://localhost:4000' };

export async function getSyncSettings(): Promise<SyncSettings> {
  const stored = await settingsRepository.get<SyncSettings>(KEY);
  return { ...DEFAULTS, ...stored };
}

export async function saveSyncSettings(settings: SyncSettings): Promise<void> {
  await settingsRepository.set(KEY, settings);
}
