import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components';
import { TUNING } from '@/config/tuning';
import { useRepository } from '@/context/RepositoryContext';
import type { Habit } from '@/models';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_SIZE, SPACE } from '@/theme/tokens';

/**
 * Habit detail — a **placeholder**. Issue #15 owns this screen (§6.3: the growth
 * chart, the journal, the design history). It exists now only so the Dashboard row's
 * navigation target is not a dead link, and therefore renders nothing but the header
 * the row already showed.
 */
export default function HabitDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repository = useRepository();
  const { colors } = useTheme();
  const [habit, setHabit] = useState<Habit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void repository.getHabit(id).then((found) => {
      if (cancelled) return;
      setHabit(found);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [repository, id]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <Text style={[styles.notice, { color: colors.muted }]}>불러오는 중…</Text>
      </View>
    );
  }

  if (habit == null) {
    return (
      <View style={styles.screen}>
        <Text style={[styles.notice, { color: colors.muted }]}>습관을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  const stat = TUNING.stats.find((s) => s.id === habit.statId);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>{habit.name}</Text>
        {stat != null && <Chip label={stat.name} variant="stat" />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: SPACE.xl, gap: SPACE.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  title: { fontSize: FONT_SIZE.xl, fontWeight: '600', letterSpacing: -0.2 },
  notice: { fontSize: FONT_SIZE.base },
});
