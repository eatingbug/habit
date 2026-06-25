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
import { color, font, fontSize, letterSpacing, radius, space } from '@/theme/tokens';

// ── MirrorWeek (.mirror / .day / .dot) ─────────────────────────────────────────

export function MirrorWeek({ days }: MirrorWeekProps) {
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

const severityAccent: Record<Severity, string> = {
  warning: color.amber,
  critical: color.red,
  ok: color.green3,
};

const severityBadge: Record<Severity, { backgroundColor: string; color: string }> = {
  warning: { backgroundColor: 'rgba(224,169,63,.14)', color: color.amber },
  critical: { backgroundColor: 'rgba(214,101,90,.15)', color: color.red },
  ok: { backgroundColor: 'rgba(70,160,100,.15)', color: color.green4 },
};

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

const styles = StyleSheet.create({
  // mirror
  mirror: {
    flexDirection: 'row',
    gap: space.sm,
    marginVertical: space.lg,
  },
  day: {
    flex: 1,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    alignItems: 'center',
  },
  weekday: {
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: letterSpacing.tag,
    textTransform: 'uppercase',
    color: color.inkFaint,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: radius.md,
    marginTop: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: {
    fontFamily: font.monoBold,
    fontSize: 11,
  },

  // flag
  flag: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.line,
    borderLeftWidth: 3,
    borderRadius: radius.lg,
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
    fontFamily: font.monoBold,
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
    color: color.inkFaint,
  },
  msg: {
    fontFamily: font.sans,
    fontSize: fontSize.bodySm,
    color: color.ink,
    marginVertical: space.xs,
    lineHeight: 20,
  },
  ev: {
    fontFamily: font.mono,
    fontSize: fontSize.meta,
    color: color.inkFaint,
  },

  // act
  act: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.xl,
    paddingVertical: 13,
    paddingHorizontal: 15,
  },
  actSelected: {
    borderColor: color.gold,
    backgroundColor: 'rgba(216,177,90,.07)',
  },
  actIcon: {
    fontSize: 18,
  },
  actBody: {
    flex: 1,
  },
  actTitle: {
    fontFamily: font.sansSemiBold,
    fontSize: fontSize.bodySm,
    color: color.ink,
  },
  actDesc: {
    fontFamily: font.mono,
    fontSize: fontSize.micro,
    color: color.inkFaint,
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

const dotStyles = StyleSheet.create({
  ok: { backgroundColor: color.green2 },
  over: { backgroundColor: color.gold },
  miss: {
    backgroundColor: color.mirrorMiss,
    borderWidth: 1,
    borderColor: 'rgba(214,101,90,.4)',
  },
  blank: { backgroundColor: color.panel2 },
});

const dotTextStyles = StyleSheet.create({
  ok: { color: '#04210f' },
  over: { color: '#1a1304' },
  miss: { color: color.red },
  blank: { color: color.inkFaint },
});
