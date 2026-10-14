// PROTOTYPE (#180) — throwaway. Lives on branch `prototype-180-home-row` only.
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export interface PrototypeSwitcherProps {
  /** Keys in order; `''` is the current production rendering. */
  variants: { key: string; name: string }[];
  current: string;
}

/** Floating bottom bar: ← label →, and the arrow keys on web. Dev builds only. */
export function PrototypeSwitcher({ variants, current }: PrototypeSwitcherProps) {
  const at = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (step: number) => {
    const next = variants[(at + step + variants.length) % variants.length];
    router.setParams({ variant: next.key });
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!__DEV__) return null;
  const v = variants[at];
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <Pressable onPress={() => go(-1)} style={styles.arrow} accessibilityLabel="이전 시안">
          <Text style={styles.text}>←</Text>
        </Pressable>
        <Text style={styles.text}>{`${v.key || '0'} (${v.name})`}</Text>
        <Pressable onPress={() => go(1)} style={styles.arrow} accessibilityLabel="다음 시안">
          <Text style={styles.text}>→</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: '#111',
    borderWidth: 2,
    borderColor: '#FF00AA',
    boxShadow: '0 4px 16px rgba(0,0,0,.35)',
  },
  arrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
