import { describe, expect, it } from 'vitest';
import { MOODS, noteOf } from '../src/render/music';
import { PLANETS } from '../src/world/planets';

describe('music', () => {
  it('has a mood for the title and every planet', () => {
    expect(MOODS.title).toBeDefined();
    for (const p of PLANETS) expect(MOODS[p.theme.id]).toBeDefined();
  });

  it('turns scale degrees into the right pitches', () => {
    const def = MOODS.red; // A dorian, root 55 Hz
    expect(noteOf(def, 0, 0)).toBeCloseTo(55);
    expect(noteOf(def, 7, 0)).toBeCloseTo(110); // one full scale up is an octave
    expect(noteOf(def, 0, 2)).toBeCloseTo(220);
    expect(noteOf(def, 4, 0)).toBeCloseTo(55 * 2 ** (7 / 12)); // the fifth
  });

  it('only uses progressions inside the scale', () => {
    for (const def of Object.values(MOODS)) {
      for (const degree of def.progression) {
        expect(degree).toBeGreaterThanOrEqual(0);
        expect(degree).toBeLessThan(def.scale.length);
      }
    }
  });
});
