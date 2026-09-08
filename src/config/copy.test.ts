import type { SkipReason } from '@/models';

import { SKIP_REASON_LABELS } from './copy';

/**
 * `SKIP_REASON_LABELS` is a pure module value, so it is assertable in the same seam
 * as the domain's pure functions — no render and no repository.
 *
 * These assertions exist because the chip row iterates the record's **key order**
 * rather than a separate order array. That removed a way for a reason to be declared
 * and then silently left off the row, but it made the on-screen order an implicit
 * property of a literal: alphabetising or regrouping `copy.ts` would reorder the
 * chips with no type error anywhere. This test is what makes that order explicit.
 */

/** The canvas's chip order — `design/parts/RowSkip.body.html:21–24`. */
const CANVAS_ORDER = ['깜빡함', '너무 힘듦', '예외', '안 내킴'];

describe('SKIP_REASON_LABELS', () => {
  it('yields its labels in the canvas chip order', () => {
    expect(Object.values(SKIP_REASON_LABELS)).toEqual(CANVAS_ORDER);
  });

  it('maps every SkipReason, so no reason can reach the row unlabelled', () => {
    // Listed literally rather than derived from the record under test: deriving the
    // expectation from the subject would make this assertion vacuous.
    const every: SkipReason[] = ['cue', 'floor', 'exception', 'identity'];

    expect(Object.keys(SKIP_REASON_LABELS)).toEqual(every);
    for (const reason of every) {
      expect(SKIP_REASON_LABELS[reason].length).toBeGreaterThan(0);
    }
  });
});
