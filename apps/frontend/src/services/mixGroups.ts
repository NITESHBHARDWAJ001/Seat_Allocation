import { settingsRepository } from './repositories.js';

export type MixGroupType = 'branch' | 'year' | 'both';

export interface MixGroup {
  id: string;
  name: string;
  /** What this group actually mixes on. Determines which of branches/years below is meaningful. */
  type: MixGroupType;
  branches: string[];
  years: number[];
}

/** Older saved groups (before `type` existed) inferred from whichever list is non-empty. */
export function mixGroupType(group: MixGroup): MixGroupType {
  if (group.type) return group.type;
  const hasBranches = group.branches.length > 0;
  const hasYears = group.years.length > 0;
  if (hasBranches && hasYears) return 'both';
  if (hasYears) return 'year';
  return 'branch';
}

const KEY = 'examMixGroups';

export async function getMixGroups(): Promise<MixGroup[]> {
  return (await settingsRepository.get<MixGroup[]>(KEY)) ?? [];
}

export async function saveMixGroup(group: MixGroup): Promise<MixGroup[]> {
  const groups = await getMixGroups();
  const next = [...groups.filter((g) => g.id !== group.id), group];
  await settingsRepository.set(KEY, next);
  return next;
}

export async function deleteMixGroup(id: string): Promise<MixGroup[]> {
  const groups = await getMixGroups();
  const next = groups.filter((g) => g.id !== id);
  await settingsRepository.set(KEY, next);
  return next;
}
