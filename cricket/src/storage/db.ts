import { openDB, type IDBPDatabase } from 'idb';
import type { Discipline, Handedness, PoseFrame, Rule, Stroke } from '../core';
import { DEFAULT_RULES } from '../core';
import { cloud, type LocalStore } from './cloud';

export interface Player {
  id: string;
  name: string;
  hand: Handedness;
  createdAt: number;
  /** Batting hand / bowling arm. */
  /** Last change, for syncing between devices. */
  updatedAt?: number;
}

export type Tag = 'Technique' | 'Footwork' | 'Workload';
export const TAGS: Tag[] = ['Technique', 'Footwork', 'Workload'];

/** Where the clip was filmed, like a drill type. */
export type SessionKind = 'nets' | 'throwdowns' | 'machine' | 'spell' | 'match';
export const SESSION_KINDS: { id: SessionKind; label: string; hint: string }[] = [
  { id: 'nets', label: 'Nets', hint: 'Net session against bowlers' },
  { id: 'throwdowns', label: 'Throw-downs', hint: 'Side-arm or hand feeds' },
  { id: 'machine', label: 'Bowling machine', hint: 'Balls from a machine' },
  { id: 'spell', label: 'Bowling spell', hint: 'A spell of deliveries' },
  { id: 'match', label: 'Match', hint: 'Match footage' },
];

export interface Session {
  id: string;
  playerId: string;
  title: string;
  createdAt: number;
  fps: number;
  start: number;
  end: number;
  duration: number;
  width: number;
  height: number;
  frames: PoseFrame[];
  strokes: Stroke[];
  tags: Tag[];
  notes: string;
  kind?: SessionKind;
  /** Batting or bowling: what the clip was analysed for. */
  discipline: Discipline;
  /** Last change, for syncing between devices. */
  updatedAt?: number;
}

/** The session list view, without the heavy pose data. */
export type SessionSummary = Omit<Session, 'frames'>;

const DB_NAME = 'creaseline';

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('players', { keyPath: 'id' });
      const s = d.createObjectStore('sessions', { keyPath: 'id' });
      s.createIndex('playerId', 'playerId');
      d.createObjectStore('videos');
      d.createObjectStore('settings');
    },
  });
  return dbp;
}

/** The device's own copy. The cloud mirror reads and writes through this without echoing. */
export const local: LocalStore = {
  async players() { return (await (await db()).getAll('players')) as Player[]; },
  async putPlayer(p) { await (await db()).put('players', p); },
  async removePlayer(id) {
    const d = await db();
    for (const s of (await d.getAllFromIndex('sessions', 'playerId', id)) as Session[]) await this.removeSession(s.id);
    await d.delete('players', id);
  },
  async allSessions() { return (await (await db()).getAll('sessions')) as Session[]; },
  async getSession(id) { return (await db()).get('sessions', id); },
  async putSession(s) { await (await db()).put('sessions', s); },
  async removeSession(id) {
    const d = await db();
    await d.delete('sessions', id);
    await d.delete('videos', id);
  },
  async getVideo(id) { return (await db()).get('videos', id); },
  async putVideo(id, b) { await (await db()).put('videos', b, id); },
  async rules() {
    const d = await db();
    const rules = (await d.get('settings', 'rules')) as Rule[] | undefined;
    return rules ? { rules, updatedAt: ((await d.get('settings', 'rulesUpdatedAt')) as number) ?? 0 } : undefined;
  },
  async putRules(rules, updatedAt) {
    const d = await db();
    await d.put('settings', rules, 'rules');
    await d.put('settings', updatedAt, 'rulesUpdatedAt');
  },
};

/** Starts the cloud mirror when the app runs inside claude.ai; a no-op elsewhere. */
export const startCloud = () => cloud.start(local);

export const store = {
  async players(): Promise<Player[]> {
    return (await local.players()).sort((a, b) => a.name.localeCompare(b.name));
  },
  async savePlayer(p: Player) {
    await local.putPlayer({ ...p, updatedAt: Date.now() });
    cloud.playerSaved(p.id);
  },
  async deletePlayer(id: string) {
    for (const s of await this.sessions(id)) await this.deleteSession(s.id);
    await local.removePlayer(id);
    cloud.deleted('players', id);
  },
  async sessions(playerId?: string): Promise<SessionSummary[]> {
    const d = await db();
    const all = (playerId ? await d.getAllFromIndex('sessions', 'playerId', playerId) : await d.getAll('sessions')) as Session[];
    return all.map(({ frames: _f, ...rest }) => rest).sort((a, b) => b.createdAt - a.createdAt);
  },
  async session(id: string): Promise<Session | undefined> {
    return local.getSession(id);
  },
  async saveSession(s: Session) {
    await local.putSession({ ...s, updatedAt: Date.now() });
    cloud.sessionSaved(s.id);
  },
  async deleteSession(id: string) {
    await local.removeSession(id);
    cloud.deleted('sessions', id);
  },
  async saveVideo(id: string, blob: Blob) {
    await local.putVideo(id, blob);
  },
  /** The session's video: from this device, or downloaded from the cloud the first time. */
  async video(id: string): Promise<Blob | undefined> {
    return (await local.getVideo(id)) ?? cloud.video(id).catch(() => undefined);
  },
  async rules(): Promise<Rule[]> {
    const saved = (await local.rules())?.rules;
    if (!saved) return DEFAULT_RULES;
    // New default rules appear automatically; saved edits win for existing ids.
    const byId = new Map(saved.map((r) => [r.id, r]));
    const merge = (d: Rule) => byId.get(d.id) ?? d;
    return [...DEFAULT_RULES.map(merge), ...saved.filter((r) => !DEFAULT_RULES.some((d) => d.id === r.id))];
  },
  async saveRules(rules: Rule[]) {
    const at = Date.now();
    await local.putRules(rules, at);
    cloud.rulesSaved(rules, at);
  },
};
