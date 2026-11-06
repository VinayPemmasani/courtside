import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { newId, topFix, type Handedness } from '../core';
import { STROKE_LABEL, fmtDate } from '../labels';
import { SESSION_KINDS, store, type Player, type SessionKind, type SessionSummary } from '../storage/db';
import { importBundle } from '../storage/share';

export function Library({ initialPlayerId }: { initialPlayerId?: string }) {
  const { go } = useApp();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<string | undefined>(initialPlayerId);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [name, setName] = useState('');
  const [hand, setHand] = useState<Handedness>('right');
  const [kindFilter, setKindFilter] = useState<SessionKind | 'all'>('all');
  const [importing, setImporting] = useState(false);

  const importShared = async (f: File | undefined) => {
    if (!f) return;
    setImporting(true);
    try {
      const { session } = await importBundle(f);
      go({ name: 'session', id: session.id });
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setImporting(false);
    }
  };

  const reload = async () => {
    const ps = await store.players();
    setPlayers(ps);
    setSelected((cur) => cur ?? ps[0]?.id);
  };
  useEffect(() => { reload(); }, []);
  useEffect(() => {
    setKindFilter('all');
    if (selected) store.sessions(selected).then(setSessions);
    else setSessions([]);
  }, [selected]);

  const addPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const p: Player = { id: newId('pl'), name: name.trim(), hand, createdAt: Date.now() };
    await store.savePlayer(p);
    setName('');
    setSelected(p.id);
    reload();
  };

  const player = players.find((p) => p.id === selected);

  return (
    <div className="library">
      <aside className="players">
        <h2>Players</h2>
        <ul>
          {players.map((p) => (
            <li key={p.id}>
              <button className={p.id === selected ? 'selected' : ''} onClick={() => setSelected(p.id)}>
                <span className="avatar">{p.name.slice(0, 1).toUpperCase()}</span>
                <span>
                  {p.name}
                  <small>{p.hand === 'right' ? 'Right-handed' : 'Left-handed'}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <form className="add-player" onSubmit={addPlayer}>
          <input placeholder="New player name" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="seg">
            <button type="button" className={hand === 'right' ? 'on' : ''} onClick={() => setHand('right')}>Right-handed</button>
            <button type="button" className={hand === 'left' ? 'on' : ''} onClick={() => setHand('left')}>Left-handed</button>
          </div>
          <button className="primary" type="submit" disabled={!name.trim()}>Add player</button>
        </form>
        <label className="import-shared">
          <input type="file" accept=".courtside,application/zip" hidden onChange={(e) => { importShared(e.target.files?.[0]); e.target.value = ''; }} />
          <span className="button">{importing ? 'Importing…' : 'Open a shared session'}</span>
          <small className="muted">A .courtside file from a teammate or coach</small>
        </label>
      </aside>

      <section className="sessions">
        {!player ? (
          <div className="empty">
            <h1>Stroke breakdowns for players and coaches</h1>
            <p>Add a player on the left, then import a video of their forehand, backhand or serve. Courtside finds each stroke, splits it into phases and writes the key points.</p>
          </div>
        ) : (
          <>
            <div className="section-head">
              <div>
                <h1>{player.name}</h1>
                <p className="muted">{player.hand === 'right' ? 'Right-handed' : 'Left-handed'} · {sessions.length} session{sessions.length === 1 ? '' : 's'}</p>
              </div>
              <div className="actions">
                <button onClick={() => go({ name: 'trends', playerId: player.id })} disabled={!sessions.length}>Progress</button>
                <button onClick={() => go({ name: 'compare', playerId: player.id })} disabled={!sessions.length}>Compare strokes</button>
                <button className="primary" onClick={() => go({ name: 'import', playerId: player.id })}>New analysis</button>
              </div>
            </div>
            {sessions.length > 0 && <Readouts sessions={sessions} />}
            {sessions.length === 0 && (
              <div className="empty small">
                <p>No sessions yet. Film one player from the side or from behind, at 60 fps if your phone allows, and import the clip.</p>
              </div>
            )}
            {sessions.length > 0 && (
              <div className="seg wrap kind-filter">
                <button className={kindFilter === 'all' ? 'on' : ''} onClick={() => setKindFilter('all')}>All</button>
                {SESSION_KINDS.filter((k) => sessions.some((s) => (s.kind ?? 'rally') === k.id)).map((k) => (
                  <button key={k.id} className={kindFilter === k.id ? 'on' : ''} onClick={() => setKindFilter(k.id)}>{k.label}</button>
                ))}
              </div>
            )}
            <div className="session-grid">
              {sessions.filter((s) => kindFilter === 'all' || (s.kind ?? 'rally') === kindFilter).map((s) => {
                const counts = s.strokes.reduce<Record<string, number>>((acc, st) => ({ ...acc, [st.type]: (acc[st.type] ?? 0) + 1 }), {});
                const fix = s.strokes.map(topFix).find(Boolean);
                return (
                  <button key={s.id} className="session-card" onClick={() => go({ name: 'session', id: s.id })}>
                    <h3>{s.title}</h3>
                    <p className="muted">{fmtDate(s.createdAt)} · {s.strokes.length} stroke{s.strokes.length === 1 ? '' : 's'}</p>
                    <p className="chips">
                      <span className="chip kind">{SESSION_KINDS.find((k) => k.id === (s.kind ?? 'rally'))?.label}</span>
                      {!!s.bounces?.length && <span className="chip">{s.bounces.length} bounces</span>}
                      {Object.entries(counts).map(([t, n]) => (
                        <span key={t} className="chip">{n} {STROKE_LABEL[t as keyof typeof STROKE_LABEL]}</span>
                      ))}
                      {s.tags.map((t) => <span key={t} className="chip tag">{t}</span>)}
                    </p>
                    {fix && <p className="fix-line">Work on: {fix.text}</p>}
                  </button>
                );
              })}
            </div>
            <p className="danger-zone">
              <button
                className="link danger"
                onClick={async () => {
                  if (!confirm(`Delete ${player.name} and all their sessions?`)) return;
                  await store.deletePlayer(player.id);
                  setSelected(undefined);
                  reload();
                }}
              >
                Delete player
              </button>
            </p>
          </>
        )}
      </section>
    </div>
  );
}

const MIX_COLORS: Record<string, string> = { forehand: 'var(--accent)', backhand: 'var(--violet)', serve: 'var(--teal)' };

/** Telemetry strip: totals across the player's sessions and the stroke mix. */
function Readouts({ sessions }: { sessions: SessionSummary[] }) {
  const strokes = sessions.flatMap((s) => s.strokes);
  const fixes = strokes.filter((s) => topFix(s)).length;
  const bounces = sessions.reduce((n, s) => n + (s.bounces?.length ?? 0), 0);
  const counts = strokes.reduce<Record<string, number>>((acc, st) => {
    const k = st.type.startsWith('backhand') ? 'backhand' : st.type;
    return { ...acc, [k]: (acc[k] ?? 0) + 1 };
  }, {});
  return (
    <div className="readouts">
      <div><span>Sessions</span><strong>{sessions.length}</strong></div>
      <div><span>Strokes tracked</span><strong className="a">{strokes.length}</strong></div>
      <div><span>Fixes flagged</span><strong className="r">{fixes}</strong></div>
      <div><span>Clean strokes</span><strong className="t">{strokes.length ? Math.round(((strokes.length - fixes) / strokes.length) * 100) : 0}%</strong></div>
      <div><span>Bounces called</span><strong className="v">{bounces}</strong></div>
      <div>
        <span>Stroke mix</span>
        <div className="mix" title={Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(' · ')}>
          {Object.entries(counts).map(([k, n]) => <i key={k} style={{ width: `${(n / Math.max(1, strokes.length)) * 100}%`, background: MIX_COLORS[k] ?? 'var(--line-2)' }} />)}
        </div>
      </div>
    </div>
  );
}
