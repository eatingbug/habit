/**
 * components/feed.tsx — presentational feed & journal pieces.
 *
 * FeedItem  (.fitem/.fcard)  — a timeline row: time line + habit/log card.
 * JournalEntry (.jentry)     — a left-border timeline entry with a leading dot.
 * DesignBox (.design-box)    — the 3-column cue/floor/identity grid.
 *
 * Pure presentation: render the props handed in. No data, no logic beyond view shape.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tag } from '@/components/primitives';
import type { DesignBoxProps, FeedItemProps, JournalEntryProps } from '@/components/types';
import type { LogType } from '@/models';
import { font, fontSize, letterSpacing, radius, space, weight, type ColorTheme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useTheme } from '@/theme/ThemeProvider';

const LOG_ICON: Record<LogType, string> = {
  note: '📝',
  win: '🏆',
  mood: '🌤',
  idea: '💡',
};

const LOG_LABEL: Record<LogType, string> = {
  note: '메모',
  win: '성취',
  mood: '기분',
  idea: '아이디어',
};

// ── FeedItem ───────────────────────────────────────────────────────────────────

export function FeedItem({ item, onPress }: FeedItemProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  if (item.kind === 'log') {
    return (
      <View style={styles.fitem}>
        <Text style={styles.time}>{`${item.time} · ${LOG_ICON[item.type]} 로그`}</Text>
        <Pressable onPress={onPress} disabled={!onPress} style={[styles.fcard, styles.fcardLog]}>
          <View style={styles.top}>
            <Text style={[styles.ltype, { backgroundColor: c.surface2, color: c.muted }]}>
              {LOG_LABEL[item.type]}
            </Text>
          </View>
          <Text style={styles.body}>{item.text}</Text>
        </Pressable>
      </View>
    );
  }

  const chip = item.isSkip
    ? item.isMiss
      ? { label: '놓침', bg: c.skipWeak, color: c.crit }
      : { label: '건너뜀', bg: c.surface2, color: c.muted }
    : item.dayState === 'over'
      ? { label: '초과 달성', bg: c.overWeak, color: c.over }
      : item.dayState === 'partial'
        ? { label: '진행 중', bg: c.partialWeak, color: c.partial }
        : { label: '최소 달성', bg: c.doneWeak, color: c.done };

  return (
    <View style={styles.fitem}>
      <Text style={styles.time}>{`${item.time} · 🎯 퀘스트`}</Text>
      <Pressable onPress={onPress} disabled={!onPress} style={styles.fcard}>
        <View style={styles.top}>
          <Text style={styles.name}>{item.habitName}</Text>
          <Tag>{item.statName}</Tag>
          <Text style={[styles.ltype, { backgroundColor: chip.bg, color: chip.color }]}>
            {chip.label}
          </Text>
          {!item.isSkip ? (
            <Text style={[styles.ltype, styles.amountChip]}>
              {item.isBinary ? '✓ 완료' : `${item.actual} ${item.unit}`}
            </Text>
          ) : null}
          {item.xp != null ? <Text style={styles.xpgain}>{`+${item.xp} XP`}</Text> : null}
        </View>
        {item.note ? <Text style={styles.body}>{item.note}</Text> : null}
      </Pressable>
    </View>
  );
}

// ── JournalEntry ─────────────────────────────────────────────────────────────────

export function JournalEntry({ item, onPress }: JournalEntryProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors: c } = useTheme();
  const chip = item.isSkip
    ? item.isMiss
      ? { label: '놓침', bg: c.skipWeak, color: c.crit }
      : { label: '건너뜀', bg: c.surface2, color: c.muted }
    : item.dayState === 'over'
      ? { label: `${item.actual} · 초과 달성`, bg: c.overWeak, color: c.over }
      : item.dayState === 'partial'
        ? { label: `${item.actual} · 진행 중`, bg: c.partialWeak, color: c.partial }
        : {
            label: item.isBinary ? '완료' : `${item.actual} · 최소 달성`,
            bg: c.doneWeak,
            color: c.done,
          };

  const muted = item.isMiss || !item.note;
  const txt = muted ? '기록 없음 — 건너뜀.' : item.note;

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.jentry}>
      <View style={[styles.jdot, item.isMiss && styles.jdotMiss]} />
      <View style={styles.jrow}>
        <Text style={styles.jdate}>{item.dateLabel}</Text>
        <Text style={[styles.jchip, { backgroundColor: chip.bg, color: chip.color }]}>
          {chip.label}
        </Text>
      </View>
      <Text style={[styles.jtxt, muted && styles.jtxtMuted]}>{txt}</Text>
    </Pressable>
  );
}

// ── DesignBox ────────────────────────────────────────────────────────────────────

function Cell({ k, value, muted }: { k: string; value: string; muted?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.cell}>
      <Text style={styles.cellKey}>{k}</Text>
      <Text style={[styles.cellValue, muted && styles.cellValueMuted]}>{value}</Text>
    </View>
  );
}

export function DesignBox({ cue, floor, floorUnit, identity, kind, onEdit }: DesignBoxProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View>
      <View style={styles.designBox}>
        <Cell k="신호 · 언제/어디서" value={cue ?? '— 미설정 —'} muted={!cue} />
        <Cell
          k="최소 기준 · 무조건 달성"
          value={kind === 'binary' ? '예 / 아니오' : `${floor} ${floorUnit}`}
        />
        <Cell k="정체성" value={identity ?? '— 미설정 —'} muted={!identity} />
      </View>
      {onEdit ? (
        <Pressable onPress={onEdit} style={styles.editBtn}>
          <Text style={styles.editText}>수정</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ColorTheme) =>
  StyleSheet.create({
    // FeedItem
    fitem: {
      paddingBottom: space.lg,
    },
    time: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
      color: c.faint,
      fontVariant: ['tabular-nums'],
    },
    fcard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
      marginTop: space.xs,
    },
    fcardLog: {
      backgroundColor: 'transparent',
      borderStyle: 'dashed',
    },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: space.sm,
    },
    name: {
      fontFamily: font.sans,
      fontWeight: weight.semibold,
      fontSize: fontSize.small,
      color: c.text,
    },
    ltype: {
      fontFamily: font.mono,
      fontSize: fontSize.tag,
      letterSpacing: letterSpacing.tag,
      paddingVertical: 2,
      paddingHorizontal: 7,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
    amountChip: {
      backgroundColor: c.surface2,
      color: c.muted,
      fontVariant: ['tabular-nums'],
    },
    xpgain: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
      color: c.accent,
      marginLeft: 'auto',
      fontVariant: ['tabular-nums'],
    },
    body: {
      fontFamily: font.sans,
      fontSize: fontSize.small,
      color: c.text,
      marginTop: space.xs,
      lineHeight: 20,
    },

    // JournalEntry
    jentry: {
      borderLeftWidth: 2,
      borderLeftColor: c.border,
      paddingLeft: space.lg,
      paddingBottom: space.lg,
      position: 'relative',
    },
    jdot: {
      position: 'absolute',
      left: -5,
      top: 3,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.accent,
    },
    jdotMiss: {
      backgroundColor: c.crit,
    },
    jrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    jdate: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
      color: c.muted,
      fontVariant: ['tabular-nums'],
    },
    jchip: {
      fontFamily: font.mono,
      fontSize: fontSize.tag,
      paddingVertical: 1,
      paddingHorizontal: 6,
      borderRadius: radius.cell,
      overflow: 'hidden',
      fontVariant: ['tabular-nums'],
    },
    jtxt: {
      fontFamily: font.sans,
      fontSize: fontSize.small,
      color: c.text,
      marginTop: space.xs,
    },
    jtxtMuted: {
      color: c.faint,
      fontFamily: font.sans,
      fontStyle: 'italic',
    },

    // DesignBox
    designBox: {
      flexDirection: 'row',
      backgroundColor: c.border,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.pill,
      overflow: 'hidden',
      gap: 1,
    },
    cell: {
      flex: 1,
      backgroundColor: c.surface,
      paddingVertical: space.md,
      paddingHorizontal: space.lg,
    },
    cellKey: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
      textTransform: 'uppercase',
      letterSpacing: letterSpacing.tag,
      color: c.faint,
      marginBottom: space.xs,
    },
    cellValue: {
      fontFamily: font.sans,
      fontSize: fontSize.small,
      color: c.text,
      lineHeight: 20,
    },
    cellValueMuted: {
      color: c.faint,
      fontFamily: font.sans,
      fontStyle: 'italic',
    },
    editBtn: {
      alignSelf: 'flex-end',
      marginTop: space.sm,
    },
    editText: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
      color: c.accent,
    },
  });
