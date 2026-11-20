/**
 * Cloud copy of players, sessions, videos and coach settings, so the same library shows on every
 * device that opens the app's claude.ai link.
 *
 * The device keeps its own copy in IndexedDB and stays the working store; this module mirrors it.
 * Every local save is pushed in the background, and changes made on another device are pulled in
 * live. Session analysis is stored as JSON files and videos are stored in parts (each file is
 * capped at 20 MB); the list entries live in the signed-in person's private part of the database.
 *
 * When the page is not running inside claude.ai (the offline zip, the dev server) the cloud is off
 * and everything works locally exactly as before.
 */
import type { Player, Session } from './db';
import type { Rule } from '../core';

export type CloudState = 'off' | 'connecting' | 'synced' | 'syncing' | 'error';
export interface CloudStatus { state: CloudState; note?: string }

/** The local store, without cloud pushes, so pulled changes never echo back. */
export interface LocalStore {
  players(): Promise<Player[]>;
  putPlayer(p: Player): Promise<void>;
  removePlayer(id: string): Promise<void>;
  allSessions(): Promise<Session[]>;
  getSession(id: string): Promise<Session | undefined>;
  putSession(s: Session): Promise<void>;
  removeSession(id: string): Promise<void>;
  getVideo(id: string): Promise<Blob | undefined>;
  putVideo(id: string, b: Blob): Promise<void>;
  rules(): Promise<{ rules: Rule[]; updatedAt: number } | undefined>;
  putRules(rules: Rule[], updatedAt: number): Promise<void>;
}

type Any = any; // the platform namespaces are untyped here; their shapes follow the runtime contract
interface Api { db: Any; assets: Any | null; root: Any }

const PART = 18 * 1024 * 1024; // under the 20 MB per-file cap
const JSON_PART = 12 * 1024 * 1024;

let status: CloudStatus = { state: 'off' };
const listeners = new Set<(s: CloudStatus) => void>();
function setStatus(s: CloudStatus) {
  status = s;
  listeners.forEach((f) => f(s));
}
export function cloudStatus() { return status; }
export function onCloudStatus(f: (s: CloudStatus) => void) {
  listeners.add(f);
  return () => { listeners.delete(f); };
}
/** Fired after changes from another device land locally; views reload their lists on it. */
export const CHANGED = 'creaseline:cloud-changed';
const changed = () => window.dispatchEvent(new Event(CHANGED));

let local: LocalStore;
let apiP: Promise<Api | null> | null = null;

const stamp = (x: { updatedAt?: number; createdAt?: number }) => x.updatedAt ?? x.createdAt ?? 0;
const round = (_k: string, v: unknown) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e5) / 1e5 : v);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function connect(): Promise<Api | null> {
  // The claude.ai viewer adds window.claude; give it a moment to appear.
  for (let i = 0; i < 20 && !(window as Any).claude?.use; i++) await sleep(100);
  const c = (window as Any).claude;
  if (!c?.use) return null;
  setStatus({ state: 'connecting' });
  try {
    const [db, user, assets] = await Promise.all([c.use('db'), c.use('user'), c.use('assets')]);
    const uid = db && user ? await user.id() : null;
    if (!db || !uid) {
      setStatus({ state: 'off', note: 'Sign in to claude.ai to save to the cloud.' });
      return null;
    }
    return { db, assets, root: db.doc(`data/users/${uid}/creaseline`) };
  } catch {
    setStatus({ state: 'error', note: 'Could not reach cloud storage.' });
    return null;
  }
}

/** Serialises cloud work so writes to one document never overlap. */
let chain: Promise<unknown> = Promise.resolve();
let pending = 0;
function enqueue(job: () => Promise<void>) {
  pending++;
  setStatus({ state: 'syncing' });
  chain = chain.then(job).catch((e) => {
    console.warn('[cloud]', e);
    setStatus({ state: 'error', note: describe(e) });
  }).finally(() => {
    pending--;
    if (pending === 0 && status.state === 'syncing') setStatus({ state: 'synced' });
  });
  return chain;
}

function describe(e: Any): string {
  switch (e?.code) {
    case 'quota_exceeded': return 'Cloud storage is full. New changes are saved on this device only.';
    case 'too_large': return 'A file was too large for cloud storage.';
    case 'revoked': case 'not_granted': return 'Cloud access was turned off for this page.';
    default: return 'Some changes have not reached the cloud yet; they are safe on this device.';
  }
}

async function uploadParts(api: Api, blob: Blob, size: number, type: string): Promise<string[]> {
  if (!api.assets) throw { code: 'not_granted' };
  const ids: string[] = [];
  for (let at = 0; at < blob.size; at += size) {
    const r = await api.assets.upload(blob.slice(at, at + size, type), { type });
    ids.push(r.id);
  }
  return ids;
}

async function downloadParts(ids: string[], type: string): Promise<Blob> {
  const parts: Blob[] = [];
  for (const id of ids) {
    const res = await fetch('/_blob/' + id);
    if (!res.ok) throw new Error(`cloud file ${id}: ${res.status}`);
    parts.push(await res.blob());
  }
  return new Blob(parts, { type });
}

function dropAssets(api: Api, ids: string[] | undefined) {
  for (const id of ids ?? []) api.assets?.delete(id).catch(() => {});
}

/** Session JSON goes up as one or more JSON files, each a valid array of session slices. */
function sessionParts(s: Session): Blob[] {
  const { frames, ...rest } = s;
  const head = JSON.stringify({ ...rest, frames: [] }, round);
  const out: Blob[] = [];
  let batch: string[] = [];
  let size = head.length;
  const flush = () => {
    out.push(new Blob([out.length === 0 ? `[${head},[${batch.join(',')}]]` : `[null,[${batch.join(',')}]]`], { type: 'application/json' }));
    batch = [];
    size = 0;
  };
  for (const f of frames) {
    const j = JSON.stringify(f, round);
    if (size + j.length > JSON_PART && batch.length) flush();
    batch.push(j);
    size += j.length + 1;
  }
  flush();
  return out;
}

async function fetchSession(ids: string[]): Promise<Session> {
  let s: Session | null = null;
  const frames: Session['frames'] = [];
  for (const id of ids) {
    const res = await fetch('/_blob/' + id);
    if (!res.ok) throw new Error(`cloud file ${id}: ${res.status}`);
    const [head, part] = await res.json();
    if (head) s = head;
    frames.push(...part);
  }
  if (!s) throw new Error('cloud session has no header');
  return { ...s, frames };
}

// ---------- pushes (local change -> cloud) ----------

const timers = new Map<string, ReturnType<typeof setTimeout>>();
function debounce(key: string, ms: number, job: () => Promise<void>) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { timers.delete(key); enqueue(job); }, ms));
}

async function pushPlayer(api: Api, id: string) {
  const p = (await local.players()).find((x) => x.id === id);
  const ref = api.root.collection('players').doc(id);
  if (p) await ref.set({ ...p, updatedAt: stamp(p) });
}

async function pushSession(api: Api, id: string) {
  const s = await local.getSession(id);
  if (!s) return;
  const ref = api.root.collection('sessions').doc(id);
  const prev = (await ref.get()).data() as Any;
  if (prev && !prev.deleted && prev.updatedAt >= stamp(s)) return;
  const parts = sessionParts(s);
  const frameParts: string[] = [];
  for (const b of parts) frameParts.push(...(await uploadParts(api, b, Infinity, 'application/json')));

  // The video only goes up once; later edits to the analysis reuse it.
  let videoParts: string[] = prev?.videoParts ?? [];
  let videoType: string = prev?.videoType ?? '';
  let videoNote: string | undefined;
  if (!videoParts.length) {
    const v = await local.getVideo(id);
    if (v) {
      videoType = /^video\/(mp4|webm)$/.test(v.type) ? v.type : 'video/mp4';
      try {
        videoParts = await uploadParts(api, v, PART, videoType);
      } catch (e: Any) {
        videoParts = [];
        videoNote = describe(e);
      }
    }
  }
  await ref.set({
    id, playerId: s.playerId, title: s.title, createdAt: s.createdAt, updatedAt: stamp(s),
    frameParts, videoParts, videoType, ...(videoNote ? { videoNote } : {}),
  });
  dropAssets(api, prev?.frameParts);
  if (videoNote) setStatus({ state: 'error', note: `${videoNote} The video for “${s.title}” stays on this device.` });
}

async function tombstone(api: Api, col: 'players' | 'sessions', id: string) {
  const ref = api.root.collection(col).doc(id);
  const prev = (await ref.get()).data() as Any;
  await ref.set({ id, deleted: true, updatedAt: Date.now() });
  if (prev) { dropAssets(api, prev.frameParts); dropAssets(api, prev.videoParts); }
}

export const cloud = {
  /** Starts syncing. Safe to call more than once. */
  start(store: LocalStore) {
    local = store;
    apiP ??= connect().then((api) => {
      if (api) startSync(api);
      return api;
    });
    return apiP;
  },
  playerSaved(id: string) {
    apiP?.then((api) => api && enqueue(() => pushPlayer(api, id)));
  },
  sessionSaved(id: string) {
    apiP?.then((api) => api && debounce('s:' + id, 2500, () => pushSession(api, id)));
  },
  deleted(col: 'players' | 'sessions', id: string) {
    clearTimeout(timers.get('s:' + id));
    apiP?.then((api) => api && enqueue(() => tombstone(api, col, id)));
  },
  rulesSaved(rules: Rule[], updatedAt: number) {
    apiP?.then((api) => api && debounce('rules', 1500, () => api.root.collection('settings').doc('rules').set({ rules, updatedAt })));
  },
  /** Brings the video down from the cloud when this device does not have it yet. */
  async video(id: string): Promise<Blob | undefined> {
    const api = await apiP;
    if (!api) return undefined;
    const d = (await api.root.collection('sessions').doc(id).get()).data() as Any;
    if (!d?.videoParts?.length) return undefined;
    const prevState = status;
    setStatus({ state: 'syncing', note: 'Downloading the video…' });
    try {
      const blob = await downloadParts(d.videoParts, d.videoType || 'video/mp4');
      await local.putVideo(id, blob);
      return blob;
    } finally {
      setStatus(prevState.state === 'syncing' ? { state: 'synced' } : prevState);
    }
  },
};

// ---------- pulls (cloud -> this device) ----------

function startSync(api: Api) {
  setStatus({ state: 'syncing' });
  let first = 2;
  const done = () => {
    if (--first === 0) {
      enqueue(() => uploadMissing(api));
      if (pending === 0) setStatus({ state: 'synced' });
    }
  };
  const fail = (e: Any) => setStatus({ state: 'error', note: describe(e) });
  const settled = new Set<string>();

  api.root.collection('players').onSnapshot((snap: Any) => {
    enqueue(async () => {
      let n = 0;
      const mine = new Map((await local.players()).map((p) => [p.id, p]));
      for (const d of snap.docs) {
        const c = d.data();
        const l = mine.get(d.id);
        if (c.deleted) {
          if (l && stamp(l) <= c.updatedAt) { await local.removePlayer(d.id); n++; }
        } else if (!l || stamp(l) < c.updatedAt) {
          await local.putPlayer(c as Player); n++;
        }
      }
      if (n) changed();
    });
    if (!settled.has('p') && !snap.metadata.fromCache) { settled.add('p'); done(); }
  }, fail);

  api.root.collection('sessions').onSnapshot((snap: Any) => {
    enqueue(async () => {
      let n = 0;
      for (const d of snap.docs) {
        const c = d.data();
        const l = await local.getSession(d.id);
        if (c.deleted) {
          if (l && stamp(l) <= c.updatedAt) { await local.removeSession(d.id); n++; }
        } else if ((!l || stamp(l) < c.updatedAt) && c.frameParts?.length) {
          const s = await fetchSession(c.frameParts);
          await local.putSession({ ...s, updatedAt: c.updatedAt });
          n++;
        }
      }
      if (n) changed();
    });
    if (!settled.has('s') && !snap.metadata.fromCache) { settled.add('s'); done(); }
  }, fail);

  enqueue(async () => {
    const c = (await api.root.collection('settings').doc('rules').get()).data() as Any;
    const l = await local.rules();
    if (c?.rules && (!l || l.updatedAt < c.updatedAt)) { await local.putRules(c.rules, c.updatedAt); changed(); }
    else if (l && (!c || c.updatedAt < l.updatedAt)) await api.root.collection('settings').doc('rules').set(l);
  });
}

/** First run on a device: send up anything the cloud has not seen (older sessions included). */
async function uploadMissing(api: Api) {
  const cps = new Map(((await api.root.collection('players').get()).docs as Any[]).map((d) => [d.id, d.data()]));
  for (const p of await local.players()) {
    const c = cps.get(p.id);
    if (!c || (!c.deleted && c.updatedAt < stamp(p))) await pushPlayer(api, p.id);
  }
  const css = new Map(((await api.root.collection('sessions').get()).docs as Any[]).map((d) => [d.id, d.data()]));
  for (const s of await local.allSessions()) {
    const c = css.get(s.id);
    if (!c || (!c.deleted && c.updatedAt < stamp(s))) await pushSession(api, s.id);
  }
}
