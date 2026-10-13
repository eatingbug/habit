import { useReducer } from 'react';

/** The `?` trigger's box in window coordinates, from `measureInWindow`. */
export interface TipAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A pointer position in window coordinates: `clientX`/`clientY`, the frame
 * `measureInWindow` uses. `null` when the event has none (a native press).
 */
export interface TipPoint {
  x: number;
  y: number;
}

interface HelpTipState {
  /** `hover` follows the mouse; `tap` stays until the next tap. */
  mode: 'hover' | 'tap' | null;
  anchor: TipAnchor | null;
  /**
   * Whether a hover may open the tooltip. A click that closes it over the `?` leaves the
   * pointer there, so hover waits until the pointer has left the `?` once.
   */
  hoverReady: boolean;
}

type HelpTipAction =
  | { type: 'hoverIn'; anchor: TipAnchor }
  | { type: 'hoverOut' }
  | { type: 'press'; anchor: TipAnchor }
  | { type: 'layerMove'; point: TipPoint | null }
  | { type: 'layerPress'; point: TipPoint | null }
  | { type: 'close' };

const HELP_TIP_CLOSED: HelpTipState = { mode: null, anchor: null, hoverReady: true };

function inside(anchor: TipAnchor | null, point: TipPoint | null): boolean {
  if (anchor == null || point == null) return false;
  const { x, y } = point;
  return x >= anchor.x && x <= anchor.x + anchor.width && y >= anchor.y && y <= anchor.y + anchor.height;
}

/**
 * The `?` tooltip's open state (SPEC §6.8). The open tooltip sits in a full-screen layer,
 * so once it is open the layer, not the `?`, receives every pointer event. The layer
 * reports where the pointer is, and that position decides.
 */
function helpTipReducer(state: HelpTipState, action: HelpTipAction): HelpTipState {
  switch (action.type) {
    case 'hoverIn':
      return state.mode == null && state.hoverReady ? { ...state, mode: 'hover', anchor: action.anchor } : state;
    case 'hoverOut':
      return state.hoverReady ? state : { ...state, hoverReady: true };
    case 'press':
      return state.mode === 'tap' ? { ...state, mode: null } : { ...state, mode: 'tap', anchor: action.anchor };
    case 'layerMove':
      return state.mode === 'hover' && !inside(state.anchor, action.point)
        ? { ...state, mode: null, hoverReady: true }
        : state;
    case 'layerPress': {
      const onTrigger = inside(state.anchor, action.point);
      if (state.mode === 'hover') {
        return onTrigger ? { ...state, mode: 'tap' } : { ...state, mode: null, hoverReady: true };
      }
      return { ...state, mode: null, hoverReady: !onTrigger };
    }
    case 'close':
      return { ...state, mode: null };
  }
}

/**
 * The `HelpTip` decisions. A hover opens the tooltip and leaving the `?` closes it. A
 * click on the `?` keeps it open, and the next click anywhere closes it. Touch has no
 * hover, so a tap opens it and the next tap closes it.
 */
export function useHelpTip() {
  const [state, dispatch] = useReducer(helpTipReducer, HELP_TIP_CLOSED);

  return {
    mode: state.mode,
    anchor: state.anchor,
    hoverIn: (anchor: TipAnchor) => dispatch({ type: 'hoverIn', anchor }),
    hoverOut: () => dispatch({ type: 'hoverOut' }),
    press: (anchor: TipAnchor) => dispatch({ type: 'press', anchor }),
    layerMove: (point: TipPoint | null) => dispatch({ type: 'layerMove', point }),
    layerPress: (point: TipPoint | null) => dispatch({ type: 'layerPress', point }),
    close: () => dispatch({ type: 'close' }),
  };
}
