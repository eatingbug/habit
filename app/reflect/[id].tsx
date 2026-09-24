import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import {
  Banner,
  Button,
  Eyebrow,
  Footnote,
  GrowthPanel,
  Hint,
  NumberField,
  SkipReasonChips,
  TextField,
  ToastOverlay,
} from '@/components';
import { REFLECTION_CUE_PLACEHOLDER, RETRY_LABEL } from '@/config/copy';
import {
  useReflection,
  type FlagCard,
  type MirrorCell,
  type ReflectionView,
} from '@/hooks/useReflection';
import type { ReflectionAction, Severity } from '@/models';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE, type Palette } from '@/theme/tokens';

/**
 * Reflection — SPEC §6.4, issue #21; layout and copy from
 * `design/parts/Reflection.body.html`, styled from `design/_tokens.css:177–196`.
 *
 * Every judgment is `useReflection`'s: each mirror cell's mark, the flags, the decline
 * evidence, which actions are offered, which one is pre-selected and what a commit
 * writes. `jest.config.js` matches `src/**` only, so this file places words and
 * decides nothing.
 *
 * The recover-first question (`:9–20`, #22) opens the screen when `view.recover` says
 * so — above the mirror, before any diagnosis (ADR-0002).
 */

/** `.mv.<state>` (`design/_tokens.css:180–184`). */
function cellSkin(colors: Palette, state: MirrorCell['state']): { box: ViewStyle; ink: string } {
  switch (state) {
    case 'done':
      return { box: { backgroundColor: colors.done, borderColor: colors.done }, ink: '#fff' };
    case 'over':
      return { box: { backgroundColor: colors.over, borderColor: colors.over }, ink: '#fff' };
    case 'partial':
      return { box: { backgroundColor: colors.partial, borderColor: colors.partial }, ink: '#fff' };
    case 'skip':
      return { box: { backgroundColor: colors.skip, borderColor: colors.skip }, ink: '#fff' };
    case 'missed':
      return { box: { backgroundColor: colors.missed, borderColor: colors.skip }, ink: colors.skip };
    case 'pending':
      return {
        box: { backgroundColor: colors.blank, borderColor: colors.borderStrong, borderStyle: 'dashed' },
        ink: colors.faint,
      };
    case null:
      return { box: { backgroundColor: colors.blank, borderColor: colors.border }, ink: colors.faint };
  }
}

function tone(colors: Palette, severity: Severity): string {
  return severity === 'critical' ? colors.crit : severity === 'warning' ? colors.warn : colors.good;
}

function monthDay(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${month}/${day}`;
}

/**
 * `.recover` (`design/_tokens.css:243–251`) — ADR-0002's question, one row per date.
 *
 * 했어요 and 안 했어요 are the same `Button`, the same width and the same `tap` height;
 * only the border hue tells them apart. ADR-0002 makes the symmetry the one guard
 * against a prompt that biases the data it collects, so neither answer may be the easy
 * one. `tap` overrides the artboard's 36px: each press writes (or opens a write).
 */
function Recover({ view }: { view: ReflectionView }) {
  const { colors } = useTheme();
  if (view.recover == null || view.habit == null) return null;
  const habitName = view.habit.name;

  return (
    <View style={[styles.recover, { borderColor: colors.borderStrong, backgroundColor: colors.surface2 }]}>
      <Text style={[styles.rq, { color: colors.text }]}>{view.recover.question}</Text>
      <Hint>기록이 없는 날이라 실패로 잡혀 있어요. 어느 쪽인지 알려 주시면 나머지는 저희가 봅니다.</Hint>
      {view.recover.dates.map((date) => (
        <View key={date} style={styles.rdBlock}>
          <View style={styles.rd}>
            <Text style={[styles.dt, { color: colors.muted }]}>{monthDay(date)}</Text>
            <View style={styles.sp} />
            <Button
              label="했어요"
              accessibilityLabel={`${monthDay(date)} 했어요`}
              tap
              disabled={view.answering}
              style={[styles.answer, { borderColor: colors.done }]}
              onPress={() => void view.fill(date)}
            />
            <Button
              label="안 했어요"
              accessibilityLabel={`${monthDay(date)} 안 했어요`}
              tap
              disabled={view.answering}
              style={[styles.answer, { borderColor: colors.skip }]}
              onPress={() => view.askWhy(date)}
            />
          </View>
          {view.asking === date && (
            // 캔버스 출처 없음 — `LogForm` 의 `… 못 했어요 · 왜?` 를 날짜로 받았다.
            <SkipReasonChips
              label={`${monthDay(date)} 못 했어요 · 왜?`}
              habitName={`${habitName} ${monthDay(date)}`}
              disabled={view.answering}
              onPick={(reason) => void view.skip(date, reason)}
            />
          )}
        </View>
      ))}
      <Hint>
        “했어요”를 누르면 그 날이 성공으로 회복되고 연속도 다시 이어집니다. “안 했어요”를 누르면
        이유를 물어볼게요.
      </Hint>
    </View>
  );
}

/** `.flag` — the left rule and the badge carry the severity (`_tokens.css:185–192`). */
function Flag({
  severity,
  badge,
  message,
  evidence,
  children,
}: {
  severity: Severity;
  badge: string;
  message: string;
  evidence: string;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const ink = tone(colors, severity);

  return (
    <View style={[styles.flag, { borderColor: colors.border, borderLeftColor: ink, backgroundColor: colors.surface }]}>
      {/* Colour carries the severity on the canvas; a screen reader gets it in words. */}
      <View
        style={[styles.badge, { backgroundColor: colors.inset }]}
        accessibilityLabel={`${badge}, ${severity === 'critical' ? '심각' : '주의'}`}
      >
        <Text style={[styles.badgeText, { color: ink }]}>{badge}</Text>
      </View>
      <Text style={[styles.fmsg, { color: colors.text }]}>{message}</Text>
      {/* Always shown, never behind a tap — the guardrail against rubber-stamping
          (§6.4, CONCEPT §6.2 rule 4). */}
      <Text style={[styles.fev, { color: colors.muted, backgroundColor: colors.inset }]}>{evidence}</Text>
      {children}
    </View>
  );
}

function FlagView({ card }: { card: FlagCard }) {
  return (
    <Flag
      severity={card.flag.severity}
      badge={card.componentLabel}
      message={card.flag.message}
      evidence={card.flag.evidence}
    >
      {card.chart != null && <GrowthPanel chart={card.chart} primary={false} />}
    </Flag>
  );
}

export default function Reflect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const view = useReflection(id);
  /** One draft per action, so switching away and back keeps what was typed. */
  const [drafts, setDrafts] = useState<Partial<Record<ReflectionAction, string>>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // §6.4: after commit, back to the Dashboard — which re-reads on focus.
    if (view.committed) router.dismissTo('/');
  }, [view.committed, router]);

  if (view.loading) {
    return (
      <View style={[styles.fill, styles.screen, { backgroundColor: colors.surface }]}>
        <Text style={[styles.notice, { color: colors.muted }]}>불러오는 중…</Text>
      </View>
    );
  }

  if (view.habit == null) {
    return (
      <View style={[styles.fill, styles.screen, { backgroundColor: colors.surface }]}>
        {view.failure != null ? (
          <Banner trailing={<Button label={RETRY_LABEL} onPress={view.failure.retry} />}>
            {view.failure.message}
          </Banner>
        ) : (
          <Text style={[styles.notice, { color: colors.muted }]}>습관을 찾을 수 없습니다.</Text>
        )}
      </View>
    );
  }

  const chosen = view.options.find((option) => option.action === view.chosen);
  const value = chosen == null ? '' : (drafts[chosen.action] ?? chosen.current);
  const setValue = (next: string) => {
    if (chosen != null) setDrafts((current) => ({ ...current, [chosen.action]: next }));
    setError(null);
  };

  async function commit() {
    setError(await view.commit(value));
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.surface }]}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.screen}>
        {/* `:3–8` — the header names the habit; the light that opened this screen is the
            Dashboard's, so no dot is repeated here. */}
        <Text style={[styles.title, { color: colors.text }]}>{view.habit.name}, 잠깐 볼까요</Text>

        {view.failure != null && (
          <Banner trailing={<Button label={RETRY_LABEL} onPress={view.failure.retry} />}>
            {view.failure.message}
          </Banner>
        )}

        <Recover view={view} />

        <Eyebrow>최근 7일은 이랬어요</Eyebrow>
        <View style={styles.mirror}>
          {view.mirror.map((cell) => {
            const skin = cellSkin(colors, cell.state);
            return (
              <View key={cell.date} style={styles.mcell}>
                <Text style={[styles.mw, { color: colors.faint }]}>{cell.weekday}</Text>
                <View style={[styles.mv, skin.box]}>
                  <Text style={[styles.mvText, { color: skin.ink }]}>{cell.mark}</Text>
                </View>
              </View>
            );
          })}
        </View>
        <Hint>
          테두리(·)는{' '}
          <Text style={{ color: colors.text, fontWeight: '600' }}>기록이 없어 실패로 잡힌 날</Text>, 꽉 찬
          칸(✕)은 직접 “안 함”을 찍은 날. 둘 다 실패지만 앞엣것은{' '}
          <Text style={{ color: colors.text, fontWeight: '600' }}>이유를 모릅니다.</Text>
        </Hint>

        {view.notes.length > 0 && (
          <View style={styles.notes}>
            {view.notes.map((note, index) => (
              <View key={`${note.date}-${index}`} style={styles.note}>
                <Text style={[styles.noteDate, { color: colors.faint }]}>{monthDay(note.date)}</Text>
                <Text style={[styles.noteText, { color: colors.muted }]}>{note.text}</Text>
              </View>
            ))}
          </View>
        )}

        <Eyebrow>저희가 보기엔</Eyebrow>
        <Hint>
          아래 진단은 <Text style={{ color: colors.text, fontWeight: '600' }}>직접 표시한 날</Text>만 보고
          말합니다 — 기록이 없는 날은 이유를 모르니 여기 끼지 않아요.
        </Hint>
        {view.decline != null && (
          <Flag
            severity={view.decline.severity}
            badge={view.decline.badge}
            message={view.decline.message}
            evidence={view.decline.evidence}
          >
            {view.decline.chart != null && <GrowthPanel chart={view.decline.chart} primary={false} />}
          </Flag>
        )}
        {view.flags.map((card) => (
          <FlagView key={card.flag.component} card={card} />
        ))}
        {/* 캔버스 출처 없음 — 신규 문구. A 🔴 made of `missed` days carries no flag
            (ADR-0002): saying so is the honest reading, not an empty section. */}
        {!view.diagnosed && (
          <Text style={[styles.notice, { color: colors.muted }]}>
            지금 기록으로는 짚을 것이 없어요. 기록이 없는 날을 채우면 더 정확히 볼 수 있어요.
          </Text>
        )}

        {/* `.rec` (`:47–57`) — the pre-selected action, its reason, its input, the others. */}
        {chosen != null && (
          <View style={[styles.rec, { borderColor: colors.accent, backgroundColor: colors.accentWeak }]}>
            <Text style={[styles.rhd, { color: colors.accentInk }]}>✓ 이렇게 해 볼까요: {chosen.label}</Text>
            <Text style={[styles.reason, { color: colors.muted }]}>{chosen.reason}</Text>
            {(chosen.field === 'cue' || chosen.field === 'identity') && (
              <TextField
                value={value}
                onChangeText={setValue}
                placeholder={chosen.field === 'cue' ? REFLECTION_CUE_PLACEHOLDER : undefined}
                invalid={error != null}
                accessibilityLabel={chosen.label}
              />
            )}
            {(chosen.field === 'floor' || chosen.field === 'target') && (
              <View style={styles.amountRow}>
                <NumberField
                  value={value}
                  onChangeText={setValue}
                  invalid={error != null}
                  accessibilityLabel={chosen.label}
                />
                <Text style={[styles.unit, { color: colors.muted }]}>{view.habit.floorUnit}</Text>
              </View>
            )}
            {error != null && <Text style={[styles.error, { color: colors.crit }]}>{error}</Text>}
            <View style={styles.alts}>
              {view.options
                .filter((option) => option.action !== view.chosen)
                .map((option) => (
                  <Button
                    key={option.action}
                    label={option.label}
                    variant="ghost"
                    onPress={() => {
                      view.choose(option.action);
                      setError(null);
                    }}
                  />
                ))}
            </View>
            <Button label="적용하고 닫기" variant="pri" block onPress={() => void commit()} />
          </View>
        )}
        <Footnote>왜 그렇게 봤는지 근거를 항상 같이 보여 드려요. 그래야 그냥 넘기지 않으실 테니까요.</Footnote>
      </ScrollView>
      {/* Outside the scroll, as on every other screen (`ToastOverlay`'s docblock). */}
      <ToastOverlay toast={view.toast} onUndo={() => void view.undoLast()} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { padding: SPACE.xl, gap: SPACE.lg },
  title: { fontSize: FONT_SIZE.xl, fontWeight: '600', letterSpacing: -0.2 },
  notice: { fontSize: FONT_SIZE.base },
  // `.mirror` / `.mcell` / `.mw` / `.mv` (`_tokens.css:177–184`).
  mirror: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  mcell: { flex: 1, alignItems: 'center', gap: 5 },
  mw: { fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs - 1.5 },
  mv: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mvText: { fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs - 1, fontWeight: '600' },
  notes: { gap: SPACE.sm },
  note: { flexDirection: 'row', gap: SPACE.md },
  noteDate: { width: 36, fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm },
  noteText: { flex: 1, fontSize: FONT_SIZE.sm },
  // `.recover` (`_tokens.css:243–251`).
  recover: { borderWidth: 1, borderRadius: RADIUS.md, padding: 12, gap: 10 },
  rq: { fontSize: FONT_SIZE.base + 0.5, fontWeight: '600', letterSpacing: -0.13 },
  rdBlock: { gap: 7 },
  rd: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dt: { width: 46, fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.sm },
  sp: { flex: 1 },
  answer: { width: 74, paddingHorizontal: 10, paddingVertical: 7 },
  // `.flag` (`_tokens.css:185–192`).
  flag: { borderWidth: 1, borderLeftWidth: 3, borderRadius: RADIUS.sm, padding: 11, gap: 6 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  badgeText: { fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs - 1.5, fontWeight: '600', letterSpacing: 0.6 },
  fmsg: { fontSize: FONT_SIZE.base, lineHeight: 18 },
  fev: {
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  // `.rec` (`_tokens.css:193–196`).
  rec: { borderWidth: 1, borderRadius: RADIUS.md, padding: 12, gap: 9 },
  rhd: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
  reason: { fontSize: FONT_SIZE.xs + 0.5 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md - 2 },
  unit: { fontSize: FONT_SIZE.sm },
  error: { fontSize: FONT_SIZE.sm },
  alts: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
});
