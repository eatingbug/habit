import { CircleQuestionMark } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ICON_LABELS } from '@/config/copy';
import { RADIUS, TAP_TARGET } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

export interface HelpTipProps {
  /** The tooltip copy — one entry of `TOOLTIPS` (§6.8). Two sentences at most. */
  text: string;
  /**
   * Without children: the bare `?` — a 32px box with a 20px icon, whose touch area is
   * grown to 48x48 (`.q`, §6.0 Touch areas). With children: the children are the
   * trigger, so the whole of them is the touch area (the pill rule). They draw their
   * own `HelpIcon` where it belongs.
   */
  children?: ReactNode;
  /** `onFill` for a `?` on a solid `accent` fill (the level card). */
  tone?: 'muted' | 'onFill';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const BOX = 32;
/** What grows the 32px box to `TAP_TARGET` on every side. */
const SLOP = (TAP_TARGET - BOX) / 2;
const GUTTER = 16;
const MAX_WIDTH = 280;
const ARROW = 6;

interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The `?` tooltip (SPEC §6.8). Opens on tap, and on hover where there is a pointer.
 * The bubble is `text` on `surface` and inverts with the theme (§6.0 Visual rules).
 *
 * It is drawn in a transparent `Modal` at the trigger's window position, so no parent's
 * `overflow` or stacking order can clip it. A tap-opened tooltip closes on any tap; a
 * hover-opened one lets the pointer through and closes when the pointer leaves.
 */
export function HelpTip({ text, children, tone = 'muted', accessibilityLabel, style }: HelpTipProps) {
  const { redesign } = useTheme();
  const window = useWindowDimensions();
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [mode, setMode] = useState<'tap' | 'hover' | null>(null);

  function open(next: 'tap' | 'hover') {
    trigger.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setMode(next);
    });
  }

  function close() {
    setMode(null);
  }

  const bubbleWidth = Math.min(MAX_WIDTH, window.width - GUTTER * 2);
  const center = anchor == null ? 0 : anchor.x + anchor.width / 2;
  const left = Math.min(Math.max(center - 24, GUTTER), window.width - GUTTER - bubbleWidth);

  return (
    <>
      <Pressable
        ref={trigger}
        onPress={() => (mode === 'tap' ? close() : open('tap'))}
        onHoverIn={() => mode == null && open('hover')}
        onHoverOut={() => mode === 'hover' && close()}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? ICON_LABELS.help}
        accessibilityState={{ expanded: mode != null }}
        style={[children == null ? styles.box : styles.wrap, style]}
      >
        {children ?? <HelpIcon tone={tone} />}
      </Pressable>

      <Modal visible={mode != null && anchor != null} transparent animationType="none" onRequestClose={close}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          pointerEvents={mode === 'tap' ? 'auto' : 'none'}
          accessible={false}
        />
        {anchor != null && (
          <View
            pointerEvents="none"
            accessibilityLiveRegion="polite"
            style={[
              styles.bubble,
              {
                // Under the drawn 32px box, not under the larger touch area.
                top: anchor.y + anchor.height - (children == null ? SLOP : 0) + ARROW + 2,
                left,
                maxWidth: bubbleWidth,
                backgroundColor: redesign.text,
              },
            ]}
          >
            <View
              style={[
                styles.arrow,
                { left: Math.max(8, center - left - ARROW), borderBottomColor: redesign.text },
              ]}
            />
            <Text style={[styles.text, { color: redesign.surface }]}>{text}</Text>
          </View>
        )}
      </Modal>
    </>
  );
}

/** The `?` glyph alone, for a `HelpTip` whose children are the trigger. */
export function HelpIcon({ tone = 'muted' }: { tone?: 'muted' | 'onFill' }) {
  const { redesign } = useTheme();
  return <CircleQuestionMark size={20} strokeWidth={2} color={tone === 'onFill' ? '#fff' : redesign.muted} />;
}

const styles = StyleSheet.create({
  // The pressable itself is `TAP_TARGET` square, pulled in by a negative margin so it
  // takes the 32px box's place in the layout. `hitSlop` alone is not honoured on web.
  box: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    margin: -SLOP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: { minHeight: TAP_TARGET },
  // `.tip` — `--r-sm`, padding 10/12, 14px at weight 600, line height 1.5.
  bubble: {
    position: 'absolute',
    borderRadius: RADIUS.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  arrow: {
    position: 'absolute',
    top: -ARROW,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW,
    borderRightWidth: ARROW,
    borderBottomWidth: ARROW,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  text: { fontSize: 14, fontWeight: '600', lineHeight: 21 },
});
