/**
 * components/primitives.tsx — presentational building blocks (SPEC §6.0).
 *
 * Wrap / Panel / SectionLabel / Tag / Pill / PrimaryButton / Toast / EmptyState /
 * BrandHeader. Adaptive: colored styles are built per-theme via `useThemedStyles`.
 * Depth is a hairline border + one faint shadow (no gradients/glows).
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { font, fontSize, letterSpacing, radius, space, layout, weight, type ColorTheme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';
import { useTheme } from '@/theme/ThemeProvider';
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

// ── Wrap ─────────────────────────────────────────────────────────────────────────
// Each screen paints its own OPAQUE themed background and fills the scene.
export function Wrap({ children, scroll }: WrapProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.root}>
      {scroll === false ? (
        <View style={styles.wrapContent}>{children}</View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.wrapContent}>
          {children}
        </ScrollView>
      )}
    </View>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────────
export function Panel({ title, sub, children, style }: PanelProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.panel, style]}>
      {title ? <Text style={styles.panelTitle}>{title}</Text> : null}
      {sub ? <Text style={styles.panelSub}>{sub}</Text> : null}
      {children}
    </View>
  );
}

// ── SectionLabel ────────────────────────────────────────────────────────────────
export function SectionLabel({ children }: SectionLabelProps) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// ── Tag ─────────────────────────────────────────────────────────────────────────
export function Tag({ children }: TagProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{children}</Text>
    </View>
  );
}

// ── Pill ────────────────────────────────────────────────────────────────────────
export function Pill({ n, label }: PillProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.pill}>
      <Text style={styles.pillNumber}>{n}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

// ── PrimaryButton — flat accent (no gradient) ─────────────────────────────────────
export function PrimaryButton({ label, onPress, disabled }: PrimaryButtonProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, disabled && styles.btnDisabled]}
    >
      <Text style={styles.btnLabel}>{label}</Text>
    </Pressable>
  );
}

// ── Toast — subtle positive confirmation ──────────────────────────────────────────
export function Toast({ message, visible }: ToastProps) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={[styles.toast, { opacity: visible ? 1 : 0 }]}>{message}</Text>;
}

// ── EmptyState ────────────────────────────────────────────────────────────────────
export function EmptyState({ children }: EmptyStateProps) {
  const styles = useThemedStyles(makeStyles);
  return <Text style={styles.empty}>{children}</Text>;
}

// ── BrandHeader (with the light/dark toggle) ──────────────────────────────────────
export function BrandHeader({ level, role, name }: BrandHeaderProps) {
  const styles = useThemedStyles(makeStyles);
  const { pref, cycle } = useTheme();
  const toggleIcon = pref === 'system' ? '◐' : pref === 'dark' ? '☾' : '☀';
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <Text style={styles.brandTitle}>
          Habi<Text style={styles.brandMark}>quest</Text>
        </Text>
        <Text style={styles.slogan}>습관을 쌓고, 나를 키우다</Text>
      </View>
      <View style={styles.headerRight}>
        <Pressable onPress={cycle} hitSlop={8} style={styles.themeToggle}>
          <Text style={styles.themeToggleText}>{toggleIcon}</Text>
        </Pressable>
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
    </View>
  );
}

const makeStyles = (c: ColorTheme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    scroll: { flex: 1 },
    wrapContent: {
      width: '100%',
      maxWidth: layout.maxWidth,
      alignSelf: 'center',
      paddingHorizontal: space.xl,
      paddingTop: space.xxl,
      paddingBottom: 80,
    },
    // Panel
    panel: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      padding: space.lg,
      ...c.shadow,
    },
    panelTitle: {
      fontFamily: font.sans,
      fontWeight: weight.semibold,
      fontSize: fontSize.title,
      color: c.text,
    },
    panelSub: {
      fontFamily: font.sans,
      color: c.faint,
      fontSize: fontSize.meta,
      marginBottom: space.md,
    },
    // SectionLabel
    sectionLabel: {
      fontFamily: font.mono,
      fontSize: fontSize.label,
      color: c.faint,
      textTransform: 'uppercase',
      letterSpacing: letterSpacing.label,
      marginVertical: space.xs,
    },
    // Tag
    tag: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.sm,
      paddingVertical: 2,
      paddingHorizontal: 7,
    },
    tagText: {
      fontFamily: font.mono,
      fontSize: fontSize.tag,
      textTransform: 'uppercase',
      letterSpacing: letterSpacing.tag,
      color: c.muted,
    },
    // Pill
    pill: {
      backgroundColor: c.surface2,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      paddingVertical: space.sm,
      paddingHorizontal: space.lg,
      alignItems: 'center',
    },
    pillNumber: {
      fontFamily: font.sans,
      fontWeight: weight.bold,
      fontSize: fontSize.title,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    pillLabel: {
      fontFamily: font.mono,
      fontSize: fontSize.tag,
      textTransform: 'uppercase',
      color: c.faint,
    },
    // PrimaryButton
    btn: {
      backgroundColor: c.accent,
      borderRadius: radius.r,
      paddingVertical: 12,
      paddingHorizontal: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPressed: { backgroundColor: c.accentInk },
    btnLabel: {
      fontFamily: font.sans,
      fontWeight: weight.semibold,
      fontSize: fontSize.small,
      color: '#ffffff',
    },
    btnDisabled: { opacity: 0.4 },
    // Toast
    toast: {
      fontFamily: font.mono,
      fontSize: fontSize.meta,
      color: c.done,
    },
    // EmptyState
    empty: {
      fontFamily: font.sans,
      fontStyle: 'italic',
      color: c.faint,
      fontSize: fontSize.small,
      paddingVertical: space.sm,
    },
    // BrandHeader
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 16,
      marginBottom: 26,
    },
    brand: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: space.md,
      flexWrap: 'wrap',
    },
    brandTitle: {
      fontFamily: font.sans,
      fontWeight: weight.bold,
      fontSize: fontSize.title,
      letterSpacing: letterSpacing.tight,
      color: c.text,
    },
    brandMark: { color: c.accent },
    slogan: {
      fontFamily: font.sans,
      fontStyle: 'italic',
      color: c.faint,
      fontSize: fontSize.small,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
    },
    themeToggle: {
      width: 34,
      height: 34,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    themeToggleText: { fontSize: fontSize.body, color: c.muted },
    lvlBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.r,
      paddingVertical: space.sm,
      paddingHorizontal: space.lg,
    },
    badgeRole: {
      fontFamily: font.mono,
      textTransform: 'uppercase',
      fontSize: fontSize.label,
      color: c.faint,
      letterSpacing: letterSpacing.label,
    },
    badgeName: {
      fontFamily: font.sans,
      fontWeight: weight.semibold,
      color: c.text,
      fontSize: fontSize.small,
    },
  });
