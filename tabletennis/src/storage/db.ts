import { openDB, type IDBPDatabase } from 'idb';
import type { Bounce, CourtCalibration, Handedness, PoseFrame, Rule, Stroke } from '../core';
import { DEFAULT_RULES } from '../core';
import { cloud, type LocalStore } from './cloud';

export interface Player {
  id: string;
  name: string;
  hand: Handedness;
  createdAt: number;
  /** A reference player (e.g. a pro filmed in slow motion): their strokes become Pro compare models. */
  pro?: boolean;
  /** Last change, for syncing between devices. */
  updatedAt?: number;
}

export type Tag = 'Technique' | 'Tactics' | 'Footwork';
export const TAGS: Tag[] = ['Technique', 'Tactics', 'Footwork'];

/** What kind of hitting the clip shows, like a drill type. */
export type SessionKind = 'rally' | 'machine' | 'feed' | 'serve' | 'match';
export const SESSION_KINDS: { id: SessionKind; label: string; hint: string }[] = [
  { id: 'rally', label: 'Drill', hint: 'Regular drills with a partner (Falkenberg, BH to BH…)' },
  { id: 'machine', label: 'Robot', hint: 'Balls from a table tennis robot' },
  { id: 'feed', label: 'Multiball', hint: 'Coach feeding from a bucket of balls' },
  { id: 'serve', label: 'Serve practice', hint: 'Serves only' },
  { id: 'match', label: 'Match', hint: 'Points or match play' },
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
  /** Older sessions have no kind; they read as rallies. */
  kind?: SessionKind;
  /** Court corners tapped on the video, for shot placement. */
  court?: CourtCalibration;
  bounces?: Bounce[];
  /** Last change, for syncing between devices. */
  updatedAt?: number;
}

/** The session list view, without the heavy pose data. */
export type SessionSummary = Omit<Session, 'frames'>;

const DB_NAME = 'spinwise';

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
    // Ball-timing targets come from the defaults unless a coach saved their own.
    const merge = (d: Rule) => { const v = byId.get(d.id); return v ? { ...v, byStage: v.byStage ?? d.byStage } : d; };
    return [...DEFAULT_RULES.map(merge), ...saved.filter((r) => !DEFAULT_RULES.some((d) => d.id === r.id))];
  },
  async saveRules(rules: Rule[]) {
    const at = Date.now();
    await local.putRules(rules, at);
    cloud.rulesSaved(rules, at);
  },
};
