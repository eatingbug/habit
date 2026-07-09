/**
 * components/reflectviz.tsx — reflection-screen visualizations.
 *
 * Pure presentation. MirrorWeek (7-day mirror strip), DiagnosisFlag (engine flag row
 * with always-visible evidence), ActionCard / ActionGrid (action picker).
 * Translates the demo's .mirror / .flag / .act / .act-grid CSS to RN.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  ActionCardProps,
  ActionGridProps,
  DiagnosisFlagProps,
  MirrorWeekProps,
} from '@/components/types';
import type { Severity } from '@/models';
import { font, fontSize, letterSpacing, radius, space, weight, type ColorTheme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useTheme } from '@/theme/ThemeProvider';

// ── MirrorWeek (.mirror / .day / .dot) ─────────────────────────────────────────

export function MirrorWeek({ days }: MirrorWeekProps) {
  const styles = useThemedStyles(makeStyles);
  const dotStyles = {
    over: styles.dotOver,
    ok: styles.dotOk,
    miss: styles.dotMiss,
    blank: styles.dotBlank,
  };
  const dotTextStyles = {
    over: styles.dotTextFilled,
    ok: styles.dotTextFilled,
    miss: styles.dotTextFilled,
    blank: styles.dotTextBlank,
  };
  return (
    <View style={styles.mirror}>
      {days.map((day, i) => (
        <View key={i} style={styles.day}>
          <Text style={styles.weekday}>{day.weekday}</Text>
          <View style={[styles.dot, dotStyles[day.state]]}>
            <Text style={[styles.dotText, dotTextStyles[day.state]]}>{day.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── DiagnosisFlag (.flag) ──────────────────────────────────────────────────────

const SEVERITY_LABEL: Record<Severity, string> = {
  warning: '경고',
  critical: '심각',
  ok: '양호',
};

const COMPONENT_LABEL: Record<string, string> = {
  floor: '최소 기준',
  cue: '신호',
  load: '부하',
  identity: '정체성',
};

export function DiagnosisFlag({ flag }: DiagnosisFlagProps) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const severityAccent: Record<Severity, string> = {
    warning: c.warn,
    critical: c.crit,
    ok: c.good,
  };
  const severityBadge: Record<Severity, { backgroundColor: string; color: string }> = {
    warning: { backgroundColor: c.partialWeak, color: c.warn },
    critical: { backgroundColor: c.skipWeak, color: c.crit },
    ok: { backgroundColor: c.doneWeak, color: c.good },
  };
  return (
    <View style={[styles.flag, { borderLeftColor: severityAccent[flag.severity] }]}>
      <View style={[styles.badge, { backgroundColor: severityBadge[flag.severity].backgroundColor }]}>
        <Text style={[styles.badgeText, { color: severityBadge[flag.severity].color }]}>
          {SEVERITY_LABEL[flag.severity]}
        </Text>
      </View>
      <View style={styles.flagBody}>
        <Text style={styles.comp}>{COMPONENT_LABEL[flag.component] ?? flag.component}</Text>
        <Text style={styles.msg}>{flag.message}</Text>
        <Text style={styles.ev}>{flag.evidence}</Text>
      </View>
    </View>
  );
}

// ── ActionCard (.act) ──────────────────────────────────────────────────────────

export function ActionCard({ icon, title, desc, selected, onPress }: ActionCardProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={[styles.act, selected && styles.actSelected]}>
      <Text style={styles.actIcon}>{icon}</Text>
      <View style={styles.actBody}>
        <Text style={styles.actTitle}>{title}</Text>
        <Text style={styles.actDesc}>{desc}</Text>
      </View>
    </Pressable>
  );
}

// ── ActionGrid (.act-grid) ─────────────────────────────────────────────────────

export function ActionGrid({ actions, selected, onSelect }: ActionGridProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.actGrid}>
      {actions.map((action) => (
        <View key={action.action} style={styles.actGridCell}>
          <ActionCard
            icon={action.icon}
            title={action.title}
            desc={action.desc}
            selected={selected === action.action}
            onPress={() => onSelect(action.action)}
          />
        </View>
      ))}
    </View>
  );
}

const makeStyles = (c: ColorTheme) =>
  StyleSheet.create({
    // mirror
    mirror: {
      flexDirection: 'row',
      gap: space.sm,
      marginVertical: space.lg,
    },
    day: {
      flex: 1,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      paddingVertical: space.md,
      paddingHorizontal: space.sm,
      alignItems: 'center',
    },
    weekday: {
      fontFamily: font.mono,
      fontSize: 10,
      letterSpacing: letterSpacing.tag,
      textTransform: 'uppercase',
      color: c.faint,
    },
    dot: {
      width: 26,
      height: 26,
      borderRadius: radius.sm,
      marginTop: space.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dotText: {
      fontFamily: font.mono,
      fontWeight: weight.bold,
      fontSize: 11,
      fontVariant: ['tabular-nums'],
    },
    dotOver: { backgroundColor: c.over },
    dotOk: { backgroundColor: c.done },
    dotMiss: { backgroundColor: c.skip },
    dotBlank: { backgroundColor: c.blank, borderWidth: 1, borderColor: c.border },
    dotTextFilled: { color: '#fff' },
    dotTextBlank: { color: c.faint },

    // flag
    flag: {
      flexDirection: 'row',
      gap: space.md,
      alignItems: 'flex-start',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderLeftWidth: 3,
      borderRadius: radius.r,
      paddingVertical: 15,
      paddingHorizontal: 17,
      marginBottom: 11,
    },
    badge: {
      borderRadius: radius.sm,
      paddingVertical: 3,
      paddingHorizontal: space.sm,
    },
    badgeText: {
      fontFamily: font.mono,
      fontWeight: weight.bold,
      fontSize: fontSize.tag,
      letterSpacing: letterSpacing.tag,
      textTransform: 'uppercase',
    },
    flagBody: {
      flex: 1,
    },
    comp: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
      letterSpacing: letterSpacing.tag,
      textTransform: 'uppercase',
      color: c.faint,
    },
    msg: {
      fontFamily: font.sans,
      fontSize: fontSize.small,
      color: c.text,
      marginVertical: space.xs,
      lineHeight: 20,
    },
    ev: {
      fontFamily: font.mono,
      fontSize: fontSize.meta,
      color: c.faint,
      fontVariant: ['tabular-nums'],
    },

    // act
    act: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      paddingVertical: 13,
      paddingHorizontal: 15,
    },
    actSelected: {
      borderColor: c.accent,
      backgroundColor: c.accentWeak,
    },
    actIcon: {
      fontSize: 18,
    },
    actBody: {
      flex: 1,
    },
    actTitle: {
      fontFamily: font.sans,
      fontWeight: weight.semibold,
      fontSize: fontSize.small,
      color: c.text,
    },
    actDesc: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
      color: c.faint,
    },
    actGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    actGridCell: {
      width: '48%',
    },
  });
