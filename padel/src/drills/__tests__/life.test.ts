import { describe, expect, it } from 'vitest';
import { TOPICS } from '../catalog';
import { ACTIVITIES, BODY, activitiesFor } from '../life';

const drillIds = new Set(TOPICS.flatMap((t) => t.drills.map((d) => d.id)));

describe('everyday and cross-training links', () => {
  it('every fix has a body breakdown with facts and at least three activities', () => {
    for (const t of TOPICS) {
      expect(BODY[t.id], t.id).toBeTruthy();
      expect(BODY[t.id].facts.length, t.id).toBeGreaterThan(0);
      expect(activitiesFor(t.id).length, t.id).toBeGreaterThanOrEqual(3);
    }
  });
  it('activities only link to fixes and drills that exist', () => {
    const topicIds = new Set(TOPICS.map((t) => t.id));
    const ids = new Set<string>();
    for (const a of ACTIVITIES) {
      expect(ids.has(a.id), a.id).toBe(false);
      ids.add(a.id);
      for (const t of a.topics) expect(topicIds.has(t), `${a.id} -> ${t}`).toBe(true);
      for (const d of a.drills) expect(drillIds.has(d), `${a.id} -> ${d}`).toBe(true);
    }
  });
  it('every drill is linked to at least one everyday or cross-training activity', () => {
    for (const t of TOPICS) for (const d of t.drills) {
      expect(activitiesFor(t.id, d.id).some((a) => a.drills.includes(d.id)), `${t.id}/${d.id}`).toBe(true);
    }
  });
  it('drills linked directly come first', () => {
    const list = activitiesFor('knees', 'squats');
    expect(list[0].drills).toContain('squats');
  });
});
