import { useMemo, useState } from 'react';
import { TOPICS, type Drill, type Topic } from '../drills/catalog';
import { ACTIVITIES, activitiesFor, BODY, KIND_LABEL, REFS, type Activity, type ActivityKind } from '../drills/life';

/** Where each drill lives, by id. */
const DRILLS = new Map<string, { topic: Topic; drill: Drill }>();
for (const t of TOPICS) for (const d of t.drills) if (!DRILLS.has(d.id)) DRILLS.set(d.id, { topic: t, drill: d });
const TOPIC = new Map(TOPICS.map((t) => [t.id, t]));

export type OpenDrill = (topicId: string, drillId?: string) => void;
const KINDS = Object.keys(KIND_LABEL) as ActivityKind[];

/** The biomechanics behind a fix: joints, muscles, how it makes the ball go and what missing it costs. */
export function BodyPanel({ topic }: { topic: Topic }) {
  const b = BODY[topic.id];
  if (!b) return null;
  return (
    <section className="body-panel">
      <h4>The body behind it <small className="muted">why “{topic.title}” works</small></h4>
      <div className="body-facts">
        {b.facts.map((f, i) => (
          <a key={i} className="fact" href={REFS[f.ref].url} target="_blank" rel="noreferrer" title={REFS[f.ref].title}>
            <b>{f.value}</b><span>{f.text}</span>
          </a>
        ))}
      </div>
      <dl className="body-map">
        <dt>Joints</dt><dd>{b.joints}</dd>
        <dt>Muscles</dt><dd>{b.muscles}</dd>
        <dt>How it works</dt><dd>{b.how}</dd>
        <dt className="r">Without it</dt><dd>{b.cost}</dd>
      </dl>
    </section>
  );
}

function ActivityCard({ a, drillId, open, showLinks }: { a: Activity; drillId?: string; open: OpenDrill; showLinks: boolean }) {
  const forThis = !!drillId && a.drills.includes(drillId);
  return (
    <article className={`life-card k-${a.kind}`}>
      <header>
        <span className="kind">{KIND_LABEL[a.kind]}</span>
        {forThis && <span className="this">Prepares this drill</span>}
      </header>
      <h5>{a.name}</h5>
      <p>{a.how}</p>
      <p className="dose">{a.dose}</p>
      <p className="why"><b>Table tennis link</b>{a.why}</p>
      {a.care && <p className="care"><b>Careful</b>{a.care}</p>}
      {showLinks && (
        <div className="links">
          <span className="muted">Helps</span>
          {a.topics.map((t) => TOPIC.get(t) && <button key={t} className="chip fixchip" onClick={() => open(t)}>{TOPIC.get(t)!.title}</button>)}
        </div>
      )}
      <div className="links">
        <span className="muted">Drills</span>
        {a.drills.filter((d) => d !== drillId && DRILLS.has(d)).map((d) => (
          <button key={d} className="chip" onClick={() => open(DRILLS.get(d)!.topic.id, d)}>{DRILLS.get(d)!.drill.title}</button>
        ))}
      </div>
      {a.ref && <a className="ref" href={REFS[a.ref].url} target="_blank" rel="noreferrer">{REFS[a.ref].title}</a>}
    </article>
  );
}

function KindFilter({ kind, set, counts }: { kind: ActivityKind | 'all'; set: (k: ActivityKind | 'all') => void; counts: Record<string, number> }) {
  return (
    <div className="seg life-filter">
      <button className={kind === 'all' ? 'on' : ''} onClick={() => set('all')}>All <small>{counts.all}</small></button>
      {KINDS.map((k) => <button key={k} disabled={!counts[k]} className={kind === k ? 'on' : ''} onClick={() => set(k)}>{KIND_LABEL[k]} <small>{counts[k] ?? 0}</small></button>)}
    </div>
  );
}

const countBy = (list: Activity[]) => list.reduce<Record<string, number>>((c, a) => ({ ...c, [a.kind]: (c[a.kind] ?? 0) + 1 }), { all: list.length });

/** Everyday habits, yoga, other sports and gym work that train the same thing as this fix and drill. */
export function DailyLinks({ topic, drill, open }: { topic: Topic; drill: Drill; open: OpenDrill }) {
  const list = useMemo(() => activitiesFor(topic.id, drill.id), [topic, drill]);
  const [kind, setKind] = useState<ActivityKind | 'all'>('all');
  if (!list.length) return null;
  const shown = list.filter((a) => kind === 'all' || a.kind === kind);
  return (
    <section className="life-panel">
      <h4>Fit it into your day <small className="muted">everyday habits and cross-training that build the same movement</small></h4>
      <KindFilter kind={kind} set={setKind} counts={countBy(list)} />
      <div className="life-grid">{shown.map((a) => <ActivityCard key={a.id} a={a} drillId={drill.id} open={open} showLinks={false} />)}</div>
    </section>
  );
}

/** Every activity, with the fixes and drills each one helps. */
export function LifePage({ open }: { open: OpenDrill }) {
  const [kind, setKind] = useState<ActivityKind | 'all'>('all');
  const shown = ACTIVITIES.filter((a) => kind === 'all' || a.kind === kind);
  return (
    <div className="life-page">
      <header className="drill-head">
        <div className="label">Train table tennis <i>|</i> <b className="r">everywhere</b></div>
        <p>
          Fast loops start at the floor: the legs and waist drive the bat, so a lot of table tennis can be trained away from the table.
          Each habit, pose and sport below works the same joint action, muscles or timing as a technique fix. Tap a fix or drill to see it on the 3D player.
        </p>
        <KindFilter kind={kind} set={setKind} counts={countBy(ACTIVITIES)} />
      </header>
      <div className="life-grid">{shown.map((a) => <ActivityCard key={a.id} a={a} open={open} showLinks />)}</div>
      <p className="muted small">
        Sources: {Object.values(REFS).map((r, i) => <span key={r.url}>{i ? ' · ' : ''}<a href={r.url} target="_blank" rel="noreferrer">{r.title}</a></span>)}.
        This is general fitness guidance, not medical advice. Ease off anything that hurts.
      </p>
    </div>
  );
}
