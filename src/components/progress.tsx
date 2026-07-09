/**
 * components/progress.tsx — XP / level progression components (SPEC §6.0).
 *
 * LevelRing, XPBar, StatCard, Tally. Adaptive + flat (no gradients): the XP bar is a flat
 * accent fill on an inset track; the stat card is a bordered surface.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { font, fontSize, letterSpacing, radius, space, weight, type ColorTheme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useTheme } from '@/theme/ThemeProvider';
import type { LevelRingProps, StatCardProps, TallyProps, XPBarProps } from '@/components/types';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Accent progress arc over an inset track with the level centered. */
export function LevelRing({ value, size = 42, progress = 0.75 }: LevelRingProps) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const stroke = size / 2 - 4;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * clamp01(progress);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cx} r={r} stroke={c.inset} strokeWidth={stroke} fill="none" />
        <Circle
          cx={cx}
          cy={cx}
          r={r}
          stroke={c.accent}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${dash} ${circumference}`}
          strokeDashoffset={0}
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

/** Flat accent fill on an inset track. */
export function XPBar({ progress }: XPBarProps) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.barTrack}>
      <View style={{ width: `${clamp01(progress) * 100}%`, height: '100%', backgroundColor: c.accent }} />
    </View>
  );
}

/** Per-stat level card with XP bar and footnote. */
export function StatCard({ data }: StatCardProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.statCard}>
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
    </View>
  );
}

/** Three summary cells. */
export function Tally({ data }: TallyProps) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const cells: { value: string; label: string; tone: 'accent' | 'muted' | 'default' }[] = [
    { value: data.quests, label: '퀘스트', tone: 'accent' },
    { value: String(data.logs), label: '로그', tone: 'muted' },
    { value: `+${data.xp}`, label: '오늘 XP', tone: 'default' },
  ];
  return (
    <View style={styles.tallyRow}>
      {cells.map((cell) => (
        <View key={cell.label} style={styles.tallyCell}>
          <Text
            style={[
              styles.tallyValue,
              cell.tone === 'accent' && { color: c.accent },
              cell.tone === 'muted' && { color: c.muted },
            ]}
          >
            {cell.value}
          </Text>
          <Text style={styles.tallyLabel}>{cell.label}</Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: ColorTheme) =>
  StyleSheet.create({
    ringCenterWrap: { alignItems: 'center', justifyContent: 'center' },
    ringInner: { backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    ringValue: {
      fontFamily: font.mono,
      fontWeight: weight.bold,
      color: c.accent,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    // XPBar
    barTrack: {
      height: 7,
      borderRadius: 6,
      backgroundColor: c.inset,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    // StatCard
    statCard: {
      backgroundColor: c.surface2,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      padding: space.lg,
      overflow: 'hidden',
    },
    statIcon: { fontSize: 22, marginBottom: space.sm },
    statName: {
      fontFamily: font.mono,
      fontSize: fontSize.label,
      textTransform: 'uppercase',
      color: c.muted,
      letterSpacing: letterSpacing.label,
    },
    statLevel: {
      fontFamily: font.sans,
      fontWeight: weight.bold,
      fontSize: fontSize.title,
      color: c.text,
      lineHeight: fontSize.title,
      marginTop: space.xs,
      marginBottom: space.md,
      fontVariant: ['tabular-nums'],
    },
    statLevelSmall: { fontFamily: font.mono, fontSize: fontSize.small, color: c.faint },
    statXpRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
    statXpText: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
      color: c.faint,
      fontVariant: ['tabular-nums'],
    },
    // Tally
    tallyRow: { flexDirection: 'row', gap: 10 },
    tallyCell: {
      flex: 1,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      paddingVertical: space.sm,
      paddingHorizontal: 13,
      alignItems: 'center',
    },
    tallyValue: {
      fontFamily: font.sans,
      fontWeight: weight.bold,
      fontSize: 18,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    tallyLabel: {
      fontFamily: font.mono,
      fontSize: 9,
      textTransform: 'uppercase',
      color: c.faint,
    },
  });
