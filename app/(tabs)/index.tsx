/**
 * Dashboard (SPEC §6.1) — the character sheet: per-stat cards, the Quest Log (habit rows
 * with heatmap + status light), the aggregate "shaky habits" count, and "+ New Quest".
 * Tapping a row → Habit Detail; tapping a status light → that habit's Reflection.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDashboard } from '@/hooks/useDashboard';
import { BrandHeader, EmptyState, HabitRow, HeatLegend, Panel, StatCard, Wrap } from '@/components';
import { font, fontSize, radius, space, type ColorTheme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';

export default function Dashboard() {
  const { loading, stats, habits, shaky } = useDashboard();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const topLevel = stats.reduce((m, s) => Math.max(m, s.level), 0);
  const shakyTotal = shaky.caution + shaky.intervention;

  return (
    <Wrap>
      <BrandHeader level={topLevel} role="모험가" />

      <View style={styles.statsGrid}>
        {stats.map((s) => (
          <View key={s.id} style={styles.statCell}>
            <StatCard data={s} />
          </View>
        ))}
      </View>

      <Panel title="퀘스트 로그" sub="최근 20일 · 퀘스트를 탭하면 저널이 열려요">
        <View style={styles.questHeader}>
          {shakyTotal > 0 ? (
            <Text style={styles.shaky}>흔들리는 습관 · {shakyTotal}</Text>
          ) : (
            <View />
          )}
          <Pressable onPress={() => router.push('/habit/new')} hitSlop={8}>
            <Text style={styles.newQuest}>+ 새 퀘스트</Text>
          </Pressable>
        </View>

        {habits.length === 0 && !loading ? (
          <EmptyState>아직 퀘스트가 없어요 — “+ 새 퀘스트”를 눌러 첫 퀘스트를 만들어 보세요.</EmptyState>
        ) : (
          habits.map((h) => (
            <HabitRow
              key={h.id}
              data={h}
              onPress={() => router.push({ pathname: '/habit/[id]', params: { id: h.id } })}
              onLightPress={() => router.push({ pathname: '/reflect/[id]', params: { id: h.id } })}
            />
          ))
        )}

        <HeatLegend />
      </Panel>
    </Wrap>
  );
}

const makeStyles = (c: ColorTheme) =>
  StyleSheet.create({
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space.lg,
      marginBottom: space.lg,
    },
    statCell: {
      flexGrow: 1,
      flexBasis: '30%',
      minWidth: 150,
    },
    questHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space.sm,
    },
    shaky: {
      fontFamily: font.mono,
      fontSize: fontSize.micro,
      color: c.warn,
      backgroundColor: c.partialWeak,
      borderRadius: radius.sm,
      paddingVertical: 2,
      paddingHorizontal: 7,
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontVariant: ['tabular-nums'],
    },
    newQuest: {
      fontFamily: font.mono,
      fontSize: fontSize.small,
      color: c.accent,
    },
  });
