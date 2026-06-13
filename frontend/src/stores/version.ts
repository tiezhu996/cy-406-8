import { create } from 'zustand';
import { versionDb } from '../api/db';
import { ContractInstance } from '../types/contract-instance';
import { Version } from '../types/version';
import { makeId, nowIso, putRecord } from '../utils/db';
import { seedVersions } from '../utils/seed';

interface VersionState {
  versions: Version[];
  loading: boolean;
  loadVersions: () => Promise<void>;
  saveVersion: (instance: ContractInstance, remark: string) => Promise<Version>;
  deleteVersion: (id: string) => Promise<void>;
}

function sortVersions(versions: Version[]) {
  return [...versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const saveQueues = new Map<string, Promise<Version>>();

export const useVersionStore = create<VersionState>((set, get) => ({
  versions: [],
  loading: false,

  async loadVersions() {
    set({ loading: true });
    try {
      let versions = await versionDb.list();
      if (!versions.length && seedVersions.length) {
        await Promise.all(seedVersions.map((version) => putRecord('versions', version)));
        versions = seedVersions;
      }
      set({ versions: sortVersions(versions) });
    } finally {
      set({ loading: false });
    }
  },

  async saveVersion(instance, remark) {
    const instanceId = instance.id;
    const doSave = async (): Promise<Version> => {
      const allVersions = await versionDb.list();
      const related = allVersions.filter((version) => version.contractInstanceId === instanceId);
      const nextNo = related.reduce((max, version) => Math.max(max, version.versionNo), 0) + 1;
      const version: Version = {
        id: makeId('ver'),
        contractInstanceId: instanceId,
        versionNo: nextNo,
        contentSnapshot: instance.finalHtml,
        variableSnapshot: instance.variableValues,
        createdAt: nowIso(),
        remark: remark || `版本 ${nextNo}`
      };

      await versionDb.save(version);
      set((state) => ({ versions: sortVersions([version, ...state.versions]) }));
      return version;
    };

    const prev = saveQueues.get(instanceId) || Promise.resolve({} as Version);
    const next = prev.then(() => doSave());
    saveQueues.set(instanceId, next.catch(() => ({}) as Version));
    return next;
  },

  async deleteVersion(id) {
    await versionDb.remove(id);
    set((state) => ({ versions: state.versions.filter((version) => version.id !== id) }));
  }
}));
