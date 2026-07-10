/**
 * context/ToastContext.tsx — the undo/confirmation toast (SPEC §6.2, B6).
 *
 * `showUndo(message, onUndo)` presents a transient bottom pill with an 실행취소 action; it
 * doubles as the "it registered" confirmation for one-tap/quick-add appends. Auto-dismisses
 * after a few seconds. `show(message)` is the same pill without an action.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, fontSize, radius, space, weight, type ColorTheme } from '@/theme/tokens';
import { useThemedStyles } from '@/theme/useThemedStyles';

const DURATION_MS = 5000;

interface ToastState {
  message: string;
  onUndo?: () => void;
}

interface ToastValue {
  showUndo: (message: string, onUndo: () => void) => void;
  show: (message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const present = useCallback(
    (t: ToastState) => {
      clearTimer();
      setToast(t);
      timer.current = setTimeout(() => setToast(null), DURATION_MS);
    },
    [clearTimer],
  );

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo<ToastValue>(
    () => ({
      showUndo: (message, onUndo) => present({ message, onUndo }),
      show: (message) => present({ message }),
    }),
    [present],
  );

  return (
    <ToastContext.Provider value={value}>
      <View style={styles.host}>
        {children}
        {toast ? (
          <ToastBar
            toast={toast}
            onUndo={() => {
              toast.onUndo?.();
              dismiss();
            }}
            onDismiss={dismiss}
          />
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({ host: { flex: 1 } });

export function useToast(): ToastValue {
  const v = useContext(ToastContext);
  if (!v) throw new Error('useToast must be used within ToastProvider');
  return v;
}

function ToastBar({
  toast,
  onUndo,
  onDismiss,
}: {
  toast: ToastState;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <Text style={styles.msg} numberOfLines={1}>
          {toast.message}
        </Text>
        {toast.onUndo ? (
          <Pressable onPress={onUndo} hitSlop={8}>
            <Text style={styles.action}>실행취소</Text>
          </Pressable>
        ) : (
          <Pressable onPress={onDismiss} hitSlop={8}>
            <Text style={styles.action}>✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const makeStyles = (c: ColorTheme) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 28,
      alignItems: 'center',
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.lg,
      maxWidth: 480,
      backgroundColor: c.text, // inverted pill — high contrast in both themes
      borderRadius: radius.pill,
      paddingVertical: 10,
      paddingHorizontal: 18,
      ...c.shadow,
    },
    msg: {
      fontFamily: font.mono,
      fontSize: fontSize.meta,
      color: c.bg,
      flexShrink: 1,
      fontVariant: ['tabular-nums'],
    },
    action: {
      fontFamily: font.sans,
      fontWeight: weight.bold,
      fontSize: fontSize.small,
      color: c.accent,
    },
  });
