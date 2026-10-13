import { TUNING } from '@/config/tuning';
import { PALETTES } from '@/theme/redesignTokens';

describe('scaffold', () => {
  it('exposes the §12 tuning constants from one file', () => {
    expect(TUNING.xpPerFloorCompletion).toBeGreaterThan(0);
    expect(TUNING.statusLight.interventionConsecMiss).toBeGreaterThan(0);
    expect(TUNING.diagnosis.missedRunForBackfillPrompt).toBeGreaterThan(0);
  });

  it('ships a light and a dark palette that differ', () => {
    expect(PALETTES.light.bg).not.toBe(PALETTES.dark.bg);
  });
});
