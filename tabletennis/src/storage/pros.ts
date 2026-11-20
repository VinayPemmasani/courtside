import { prepare, type ProRef } from '../core';
import { store } from './db';

let cache: { at: number; refs: ProRef[] } | null = null;

/** Every stroke of every player marked "Pro reference", ready for Pro compare. */
export async function loadProRefs(force = false): Promise<ProRef[]> {
  if (cache && !force && Date.now() - cache.at < 30_000) return cache.refs;
  const refs: ProRef[] = [];
  for (const pl of (await store.players()).filter((p) => p.pro)) {
    for (const sum of await store.sessions(pl.id)) {
      const s = await store.session(sum.id);
      if (!s?.strokes.length) continue;
      const p = prepare(s.frames, s.fps, pl.hand);
      for (const st of s.strokes) {
        refs.push({ key: `${s.id}:${st.id}`, player: pl.name, hand: pl.hand, fps: s.fps, frames: p.frames, stroke: st, sessionId: s.id, title: s.title });
      }
    }
  }
  cache = { at: Date.now(), refs };
  return refs;
}
