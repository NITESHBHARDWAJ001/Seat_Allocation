import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Minimal generic persistence: an in-memory Map mirrored to a JSON file on
 * every mutation. Used by apps/backend so the repository-swap story (spec
 * §67/§62) is backed by something real rather than a pure in-memory mock
 * that forgets everything on restart.
 */
export class JsonFileStore<T extends { id: string }> {
  private cache = new Map<string, T>();
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor(private readonly filePath: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        try {
          const raw = await readFile(this.filePath, 'utf-8');
          const items = JSON.parse(raw) as T[];
          for (const item of items) this.cache.set(item.id, item);
        } catch {
          // file doesn't exist yet — start empty
        }
        this.loaded = true;
      })();
    }
    await this.loadPromise;
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify([...this.cache.values()], null, 2), 'utf-8');
  }

  async all(): Promise<T[]> {
    await this.ensureLoaded();
    return [...this.cache.values()];
  }

  async get(id: string): Promise<T | undefined> {
    await this.ensureLoaded();
    return this.cache.get(id);
  }

  async set(item: T): Promise<T> {
    await this.ensureLoaded();
    this.cache.set(item.id, item);
    await this.persist();
    return item;
  }

  async setMany(items: T[]): Promise<T[]> {
    await this.ensureLoaded();
    for (const item of items) this.cache.set(item.id, item);
    await this.persist();
    return items;
  }

  async delete(id: string): Promise<void> {
    await this.ensureLoaded();
    this.cache.delete(id);
    await this.persist();
  }
}
