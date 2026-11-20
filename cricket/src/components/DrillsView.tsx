import { useState } from 'react';
import type { Discipline, Handedness, StrokeType } from '../core';
import { disciplineOf } from '../core';
import { useApp, type Route } from '../App';
import { TOPICS, type DrillWhere } from '../drills/catalog';

const WHERE_LABEL: Record<DrillWhere, string> = { nets: 'In the nets', 'off-field': 'Off the field' };

/** Drills for each technique fix: net drills and off-field exercises, with the body behind the fix. */
export function DrillsView({ topic: topicId, stroke, back }: { topic?: string; stroke?: StrokeType; hand?: Handedness; back?: Route }) {
  const { go } = useApp();
  const first = TOPICS.find((t) => t.id === topicId);
  const [discipline, setDiscipline] = useState<Discipline>(first?.discipline ?? (stroke ? disciplineOf(stroke) : 'batting'));
  const topics = TOPICS.filter((t) => t.discipline === discipline);
  const [sel, setSel] = useState(first?.id ?? topics[0].id);
  const topic = topics.find((t) => t.id === sel) ?? topics[0];
  const [where, setWhere] = useState<DrillWhere>('nets');
  const shown = topic.drills.filter((d) => d.where === where);
  const list = shown.length ? shown : topic.drills;

  return (
    <div className="drills">
      {back && <button className="link" onClick={() => go(back)}>← Back to the session</button>}
      <h1>Drills</h1>
      <p className="muted">One drill per session works better than five. Pick the fix the analysis flagged first.</p>
      <div className="seg">
        {(['batting', 'bowling'] as Discipline[]).map((d) => (
          <button key={d} className={discipline === d ? 'on' : ''} onClick={() => { setDiscipline(d); setSel(TOPICS.find((t) => t.discipline === d)!.id); }}>{d === 'batting' ? 'Batting' : 'Bowling'}</button>
        ))}
      </div>
      <div className="drills-grid">
        <aside className="topic-list">
          {topics.map((t) => (
            <button key={t.id} className={t.id === topic.id ? 'selected' : ''} onClick={() => setSel(t.id)}>{t.title}</button>
          ))}
        </aside>
        <section className="topic">
          <h2>{topic.title}</h2>
          <p className="why"><strong>Why it matters.</strong> {topic.why}</p>
          <div className="seg">
            {(['nets', 'off-field'] as DrillWhere[]).map((w) => (
              <button key={w} className={where === w ? 'on' : ''} disabled={!topic.drills.some((d) => d.where === w)} onClick={() => setWhere(w)}>{WHERE_LABEL[w]}</button>
            ))}
          </div>
          <div className="drill-cards">
            {list.map((d) => (
              <article key={d.id} className="drill-card">
                <header><h3>{d.name}</h3><span className="chip">{WHERE_LABEL[d.where]}</span></header>
                <p className="muted small">Kit: {d.kit} · {d.dose}</p>
                <ol>{d.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                <p className="cue">Cue: {d.cue}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
