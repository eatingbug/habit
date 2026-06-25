/**
 * components/primitives.tsx — presentational building blocks.
 *
 * Translations of the demo's .wrap / .panel / .section-label / .tag / .pill /
 * .btn.primary / .toast / .empty / header.app primitives (mvp/habiquest-demo_2.html).
 * Pure presentation: render the props handed in, no app data.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppBackground, Gradient } from '@/theme/Gradient';
import { color, font, fontSize, letterSpacing, radius, space, layout } from '@/theme/tokens';
import { LevelRing } from '@/components/progress';
import type {
  BrandHeaderProps,
  EmptyStateProps,
  PanelProps,
  PillProps,
  PrimaryButtonProps,
  SectionLabelProps,
  TagProps,
  ToastProps,
  WrapProps,
} from '@/components/types';

// ── Wrap (.wrap) ───────────────────────────────────────────────────────────────
// Each screen paints its own OPAQUE background (dark base + glow) and fills the scene,
// so the active screen fully covers the inactive one when switching tabs/routes — no
// transparent-scene overlap. The page body itself never scrolls horizontally.
export function Wrap({ children, scroll }: WrapProps) {
  return (
    <AppBackground>
      {scroll === false ? (
        <View style={styles.wrapContent}>{children}</View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.wrapContent}>
          {children}
        </ScrollView>
      )}
    </AppBackground>
  );
}

// ── Panel (.panel) ───────────────────────────────────────────────────────────────
export function Panel({ title, sub, children, style }: PanelProps) {
  return (
    <View style={[styles.panel, style]}>
      {title ? <Text style={styles.panelTitle}>{title}</Text> : null}
      {sub ? <Text style={styles.panelSub}>{sub}</Text> : null}
      {children}
    </View>
  );
}

// ── SectionLabel (.section-label) ────────────────────────────────────────────────
export function SectionLabel({ children }: SectionLabelProps) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// ── Tag (.tag) ───────────────────────────────────────────────────────────────────
export function Tag({ children }: TagProps) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{children}</Text>
    </View>
  );
}

// ── Pill (.pill) ─────────────────────────────────────────────────────────────────
export function Pill({ n, label }: PillProps) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillNumber}>{n}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

// ── PrimaryButton (.btn.primary) ─────────────────────────────────────────────────
export function PrimaryButton({ label, onPress, disabled }: PrimaryButtonProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={disabled ? styles.btnDisabled : undefined}>
      <Gradient preset="goldButton" style={styles.btn}>
        <Text style={styles.btnLabel}>{label}</Text>
      </Gradient>
    </Pressable>
  );
}

// ── Toast (.toast) ───────────────────────────────────────────────────────────────
export function Toast({ message, visible }: ToastProps) {
  return <Text style={[styles.toast, { opacity: visible ? 1 : 0 }]}>{message}</Text>;
}

// ── EmptyState (.empty) ──────────────────────────────────────────────────────────
export function EmptyState({ children }: EmptyStateProps) {
  return <Text style={styles.empty}>{children}</Text>;
}

// ── BrandHeader (header.app / .brand / .lvl-badge) ───────────────────────────────
export function BrandHeader({ level, role, name }: BrandHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <Text style={styles.brandTitle}>
          Habi<Text style={styles.brandMark}>quest</Text>
        </Text>
        <Text style={styles.slogan}>습관을 쌓고, 나를 키우다</Text>
      </View>
      {level !== undefined ? (
        <View style={styles.lvlBadge}>
          <LevelRing value={level} />
          <View>
            {role ? <Text style={styles.badgeRole}>{role}</Text> : null}
            {name ? <Text style={styles.badgeName}>{name}</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  // .wrap
  wrapContent: {
    width: '100%',
    maxWidth: layout.maxWidth,
    alignSelf: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.xxl,
    paddingBottom: 80,
  },
  // .panel
  panel: {
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.card,
    padding: space.lg,
  },
  panelTitle: {
    fontFamily: font.serifSemiBold,
    fontSize: fontSize.panelTitle,
    color: color.ink,
  },
  panelSub: {
    fontFamily: font.sans,
    color: color.inkFaint,
    fontSize: fontSize.meta,
    marginBottom: space.md,
  },
  // .section-label
  sectionLabel: {
    fontFamily: font.mono,
    fontSize: fontSize.label,
    color: color.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.label,
    marginVertical: space.xs,
  },
  // .tag
  tag: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.sm,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  tagText: {
    fontFamily: font.mono,
    fontSize: fontSize.tag,
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.tag,
    color: color.inkDim,
  },
  // .pill
  pill: {
    backgroundColor: color.panel2,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.lg,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    alignItems: 'center',
  },
  pillNumber: {
    fontFamily: font.serifBlack,
    fontSize: fontSize.pillNumber,
    color: color.gold,
  },
  pillLabel: {
    fontFamily: font.mono,
    fontSize: fontSize.tag,
    textTransform: 'uppercase',
    color: color.inkFaint,
  },
  // .btn.primary
  btn: {
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: {
    fontFamily: font.sansSemiBold,
    fontSize: fontSize.bodySm,
    color: '#1a1304',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  // .toast
  toast: {
    fontFamily: font.mono,
    fontSize: fontSize.meta,
    color: color.green4,
  },
  // .empty
  empty: {
    fontFamily: font.serifItalic,
    fontStyle: 'italic',
    color: color.inkFaint,
    fontSize: fontSize.small,
    paddingVertical: space.sm,
  },
  // header.app
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 26,
  },
  // .brand
  brand: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    flexWrap: 'wrap',
  },
  brandTitle: {
    fontFamily: font.serifBlack,
    fontSize: fontSize.brand,
    letterSpacing: letterSpacing.tight,
    color: color.ink,
  },
  brandMark: {
    color: color.gold,
  },
  slogan: {
    fontFamily: font.serifItalic,
    fontStyle: 'italic',
    color: color.inkFaint,
    fontSize: fontSize.bodySm,
  },
  // .lvl-badge
  lvlBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: color.panel,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.card,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  badgeRole: {
    fontFamily: font.mono,
    textTransform: 'uppercase',
    fontSize: fontSize.label,
    color: color.inkFaint,
    letterSpacing: letterSpacing.label,
  },
  badgeName: {
    fontFamily: font.sansSemiBold,
    color: color.ink,
    fontSize: fontSize.bodySm,
  },
});
