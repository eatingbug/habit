import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Card, HelpTip } from '@/components/re';
import { DETAIL_COPY, SCREEN_WORDS, TOOLTIPS } from '@/config/copy';
import type { DetailHero } from '@/hooks/useHabitDetail';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The Habit Detail hero card (SPEC §6.5 item 3): the 자리 잡는 중 ring
 * (`ReDetailForming`), the 주마다 한 양 bars (`ReDetailEstablished`), or 연속 alone for
 * an established yes/no habit. Every number and word is the hook's (`DetailHero`).
 */
export function HeroCard({ hero }: { hero: DetailHero }) {
  switch (hero.kind) {
    case 'forming':
      return (
        <Card>
          <HeadLine label={DETAIL_COPY.forming} help={TOOLTIPS.forming} />
          <View style={styles.formingRow}>
            <Ring ratio={hero.ratio} days={hero.daysLabel} expected={hero.expectedLabel} />
            <StreakBlock streak={hero.streak} nextStep={hero.nextStep} />
          </View>
        </Card>
      );
    case 'streak':
      return (
        <Card>
          <StreakBlock streak={hero.streak} nextStep={hero.nextStep} />
        </Card>
      );
    case 'weekly':
      return <WeeklyCard hero={hero} />;
  }
}

/** A `label` head with its `?` (`.row.t-label.muted`). */
function HeadLine({ label, help }: { label: string; help: string }) {
  const { redesign } = useTheme();
  return (
    <View style={styles.headLine}>
      <Text style={[TYPE.label, { color: redesign.muted }]}>{label}</Text>
      <HelpTip text={help} />
    </View>
  );
}

const RING = 112;
const STROKE = 12;
const RADIUS_RING = (RING - STROKE) / 2 - 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS_RING;

/** `.ring` — a 112px ring on `inset` with a `done` arc, the count inside it. */
function Ring({ ratio, days, expected }: { ratio: number; days: string; expected: string }) {
  const { redesign } = useTheme();
  const center = RING / 2;

  return (
    <View style={styles.ring} accessible accessibilityLabel={`${days} ${expected}`}>
      <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
        <Circle cx={center} cy={center} r={RADIUS_RING} stroke={redesign.inset} strokeWidth={STROKE} fill="none" />
        {ratio > 0 && (
          <Circle
            cx={center}
            cy={center}
            r={RADIUS_RING}
            stroke={redesign.done}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE * ratio} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
        )}
      </Svg>
      <View style={styles.ringInner}>
        <Text style={[TYPE.headline, styles.number, { color: redesign.text }]}>{days}</Text>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{expected}</Text>
      </View>
    </View>
  );
}

/** 연속 with its `?`, the big `streak`-ink number, and the next step under it. */
function StreakBlock({ streak, nextStep }: { streak: number; nextStep: string }) {
  const { redesign } = useTheme();
  return (
    <View style={styles.grow}>
      <HeadLine label={SCREEN_WORDS.streak} help={TOOLTIPS.streak} />
      <Text style={[TYPE.number, styles.number, { color: redesign.streakInk }]}>
        {streak}
        <Text style={[TYPE.title, { color: redesign.muted }]}>{DETAIL_COPY.days}</Text>
      </Text>
      <Text style={[TYPE.body, styles.nextStep, { color: redesign.muted }]}>{nextStep}</Text>
    </View>
  );
}

/** `.bars` — the weekly totals, the floor and target lines, ⭐ on the best week. */
function WeeklyCard({ hero }: { hero: Extract<DetailHero, { kind: 'weekly' }> }) {
  const { redesign } = useTheme();
  const { chart } = hero;
  const last = chart.bars.length - 1;

  return (
    <Card>
      <View style={styles.spread}>
        <HeadLine label={DETAIL_COPY.weekly} help={TOOLTIPS.weeklyTotal} />
        <Text style={[TYPE.bodyStrong, styles.number, { color: redesign.text }]}>{hero.totalLabel}</Text>
      </View>
      <View style={styles.bars}>
        {chart.bars.map((bar, index) => (
          <View
            key={bar.weeksAgo}
            style={[
              styles.bar,
              {
                height: `${bar.height}%`,
                backgroundColor: index === last ? redesign.accent : redesign.accentTint,
              },
            ]}
          >
            {bar.best && (
              <Text style={styles.star} accessibilityLabel={DETAIL_COPY.bestWeek}>
                ⭐
              </Text>
            )}
          </View>
        ))}
        <Line bottom={chart.floorLine} label={hero.floorLabel} color={redesign.borderStrong} ink={redesign.muted} />
        {chart.targetLine != null && hero.targetLabel != null && (
          <Line bottom={chart.targetLine} label={hero.targetLabel} color={redesign.over} ink={redesign.doneInk} />
        )}
      </View>
      <View style={[styles.spread, styles.axis]}>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{hero.startLabel}</Text>
        <Text style={[TYPE.label, { color: redesign.muted }]}>{hero.endLabel}</Text>
      </View>
    </Card>
  );
}

/** `.bars .ln` — a dashed reference line with its label at the right. */
function Line({ bottom, label, color, ink }: { bottom: number; label: string; color: string; ink: string }) {
  return (
    <View pointerEvents="none" style={[styles.line, { bottom: `${bottom}%`, borderTopColor: color }]}>
      <Text style={[TYPE.label, styles.lineLabel, { color: ink }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headLine: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  formingRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 8 },
  ring: { width: RING, height: RING },
  ringInner: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  number: { fontVariant: ['tabular-nums'] },
  grow: { flex: 1, minWidth: 0 },
  nextStep: { marginTop: 6 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  // `.bars` — `gap:6px; height:120px; margin-top:12px`.
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120, marginTop: 12 },
  bar: { flex: 1, borderTopLeftRadius: 6, borderTopRightRadius: 6, alignItems: 'center' },
  star: { position: 'absolute', top: -22, fontSize: 14, lineHeight: 20 },
  line: { position: 'absolute', left: 0, right: 0, borderTopWidth: 2, borderStyle: 'dashed' },
  lineLabel: { textAlign: 'right', lineHeight: 16, paddingTop: 2 },
  axis: { marginTop: 4 },
});
