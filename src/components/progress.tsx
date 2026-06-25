/**
 * components/progress.tsx — XP / level progression presentation components.
 *
 * Pure presentation: LevelRing, XPBar, StatCard, Tally. Translated from the demo's
 * .ring / .bar / .stat / .tally CSS (mvp/habiquest-demo_2.html).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { color, font, fontSize, letterSpacing, radius, space } from '@/theme/tokens';
import { Gradient } from '@/theme/Gradient';
import type { LevelRingProps, StatCardProps, TallyProps, XPBarProps } from '@/components/types';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** .lvl-badge .ring — gold progress arc over a dark track with the level centered. */
export function LevelRing({ value, size = 42, progress = 0.75 }: LevelRingProps) {
  const stroke = size / 2 - 4; // matches the demo's inset:4px inner disc
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * clamp01(progress);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cx} r={r} stroke="#2a2f3d" strokeWidth={stroke} fill="none" />
        <Circle
          cx={cx}
          cy={cx}
          r={r}
          stroke={color.gold}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${circumference}`}
          strokeDashoffset={0}
          // rotate so the arc starts at the top
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringCenterWrap]}>
        <View style={[styles.ringInner, { width: size - 8, height: size - 8, borderRadius: (size - 8) / 2 }]}>
          <Text style={styles.ringValue}>{value}</Text>
        </View>
      </View>
    </View>
  );
}

/** .bar / .bar>i — track with a gold gradient fill. */
export function XPBar({ progress }: XPBarProps) {
  return (
    <View style={styles.barTrack}>
      <Gradient preset="xpBar" style={{ width: `${clamp01(progress) * 100}%`, height: '100%' }} />
    </View>
  );
}

/** .stat — per-stat level card with XP bar and footnote. */
export function StatCard({ data }: StatCardProps) {
  return (
    <Gradient preset="stat" style={styles.statCard}>
      <Text style={styles.statIcon}>{data.icon}</Text>
      <Text style={styles.statName}>{data.name}</Text>
      <Text style={styles.statLevel}>
        {data.level}
        <Text style={styles.statLevelSmall}> 레벨</Text>
      </Text>
      <XPBar progress={data.progress} />
      <View style={styles.statXpRow}>
        <Text style={styles.statXpText}>{`${data.xp.toLocaleString()} XP`}</Text>
        <Text style={styles.statXpText}>{data.toNextLabel}</Text>
      </View>
    </Gradient>
  );
}

/** .tally — three summary cells. */
export function Tally({ data }: TallyProps) {
  const cells: { value: string; label: string; tone: 'gold' | 'blue' | 'default' }[] = [
    { value: data.quests, label: '퀘스트', tone: 'gold' },
    { value: String(data.logs), label: '로그', tone: 'blue' },
    { value: `+${data.xp}`, label: '오늘 XP', tone: 'default' },
  ];
  return (
    <View style={styles.tallyRow}>
      {cells.map((c) => (
        <View key={c.label} style={styles.tallyCell}>
          <Text
            style={[
              styles.tallyValue,
              c.tone === 'gold' && { color: color.gold },
              c.tone === 'blue' && { color: color.blue },
            ]}
          >
            {c.value}
          </Text>
          <Text style={styles.tallyLabel}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // LevelRing
  ringCenterWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    backgroundColor: color.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    fontFamily: font.monoBold,
    color: color.gold,
    fontSize: 15,
  },

  // XPBar
  barTrack: {
    height: 7,
    borderRadius: 6,
    backgroundColor: color.bg,
    borderWidth: 1,
    borderColor: color.line,
    overflow: 'hidden',
  },

  // StatCard
  statCard: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.card,
    padding: space.lg,
    overflow: 'hidden',
  },
  statIcon: {
    fontSize: 22,
    marginBottom: space.sm,
  },
  statName: {
    fontFamily: font.mono,
    fontSize: fontSize.label,
    textTransform: 'uppercase',
    color: color.inkDim,
    letterSpacing: letterSpacing.label,
  },
  statLevel: {
    fontFamily: font.serifBlack,
    fontSize: fontSize.statLevel,
    color: color.ink,
    lineHeight: fontSize.statLevel,
    marginTop: space.xs,
    marginBottom: space.md,
  },
  statLevelSmall: {
    fontFamily: font.mono,
    fontSize: fontSize.small,
    color: color.inkFaint,
  },
  statXpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  statXpText: {
    fontFamily: font.mono,
    fontSize: fontSize.micro,
    color: color.inkFaint,
  },

  // Tally
  tallyRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tallyCell: {
    flex: 1,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    paddingVertical: space.sm,
    paddingHorizontal: 13,
    alignItems: 'center',
  },
  tallyValue: {
    fontFamily: font.serifBlack,
    fontSize: 18,
    color: color.ink,
  },
  tallyLabel: {
    fontFamily: font.mono,
    fontSize: 9,
    textTransform: 'uppercase',
    color: color.inkFaint,
  },
});
