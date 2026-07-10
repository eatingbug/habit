/**
 * Today (SPEC §6.2, CONCEPT §9) — date header + tally, the unified composer (habit entry
 * OR free log), and a chronological feed interleaving the day's entries and logs.
 */
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useToday } from '@/hooks/useToday';
import { Composer, EmptyState, FeedItem, Tally, Wrap } from '@/components';
import type { ComposerInitial, FeedEntry } from '@/components/types';
import { font, fontSize, letterSpacing, space, weight, type ColorTheme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { formatShortDate, formatWeekday } from '@/util/date';

/** Turn a feed row back into composer pre-fill values for editing. */
function toInitial(f: FeedEntry): ComposerInitial {
  const [hour, rawMinute] = f.time.split(':');
  const minute = String(Math.floor(Number(rawMinute) / 10) * 10).padStart(2, '0');
  if (f.kind === 'log') {
    return { target: 'free', hour, minute, logType: f.type, note: f.text };
  }
  return {
    target: f.habitId,
    hour,
    minute,
    count: f.isBinary ? '' : String(f.actual),
    note: f.note,
    skipMode: f.isSkip,
    skipReason: f.skipReason,
  };
}

export default function Today() {
  const { date, tally, feed, habits, submit, update, requestDelete, todaySumByHabit, lastAmountByHabit } =
    useToday();
  const [editing, setEditing] = useState<FeedEntry | null>(null);
  const editingId = editing?.id ?? null;
  const styles = useThemedStyles(makeStyles);

  const handleDelete = async (id: string) => {
    const req = await requestDelete(id);
    if (req.message) {
      Alert.alert('기록 삭제', req.message, [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => req.confirm().then(() => setEditing(null)) },
      ]);
    } else {
      await req.confirm();
      setEditing(null);
    }
  };

  return (
    <Wrap>
      <View style={styles.head}>
        <View>
          <Text style={styles.eyebrow}>{formatWeekday(date)}</Text>
          <Text style={styles.date}>{formatShortDate(date)}</Text>
        </View>
        <Tally data={tally} />
      </View>

      <Composer
        key={editingId ?? 'new'}
        habits={habits}
        initial={editing ? toInitial(editing) : undefined}
        editing={!!editing}
        onCancel={() => setEditing(null)}
        onDelete={editingId ? () => handleDelete(editingId) : undefined}
        todaySumByHabit={todaySumByHabit}
        lastAmountByHabit={lastAmountByHabit}
        onSubmit={(s) => {
          if (editingId) update(editingId, s).then(() => setEditing(null));
          else submit(s);
        }}
      />

      <View style={styles.feed}>
        {feed.length === 0 ? (
          <EmptyState>오늘 기록한 내용이 없어요.</EmptyState>
        ) : (
          feed.map((f) => <FeedItem key={f.id} item={f} onPress={() => setEditing(f)} />)
        )}
      </View>
    </Wrap>
  );
}

const makeStyles = (c: ColorTheme) =>
  StyleSheet.create({
    head: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: space.md,
      marginBottom: space.lg,
    },
    eyebrow: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
      color: c.accent,
      textTransform: 'uppercase',
      letterSpacing: letterSpacing.label,
      marginBottom: 4,
    },
    date: {
      fontFamily: font.sans,
      fontWeight: weight.bold,
      fontSize: fontSize.title,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    feed: {
      marginTop: space.lg,
    },
  });
