import { act, renderHook } from '@testing-library/react-native';

import { useHelpTip } from './useHelpTip';

/**
 * The `?` tooltip's open state (#160). The open tooltip's full-screen layer takes every
 * pointer event, so the layer's moves and presses must be able to close it.
 */

/** A 48x48 `?` at (100, 200). */
const Q = { x: 100, y: 200, width: 48, height: 48 };
const ON_Q = { x: 120, y: 220 };
const AWAY = { x: 20, y: 600 };

function tip() {
  return renderHook(() => useHelpTip()).result;
}

describe('useHelpTip — mouse', () => {
  it('a hover opens it, and moving off the `?` closes it', () => {
    const t = tip();
    act(() => t.current.hoverIn(Q));
    expect(t.current.mode).toBe('hover');

    act(() => t.current.layerMove(ON_Q));
    expect(t.current.mode).toBe('hover');

    act(() => t.current.layerMove(AWAY));
    expect(t.current.mode).toBeNull();
  });

  it('the `?` losing the pointer to the layer does not close a hover', () => {
    const t = tip();
    act(() => t.current.hoverIn(Q));
    act(() => t.current.hoverOut());
    expect(t.current.mode).toBe('hover');
  });

  it('a click on the `?` keeps a hover open, and a second click closes it', () => {
    const t = tip();
    act(() => t.current.hoverIn(Q));
    act(() => t.current.layerPress(ON_Q));
    expect(t.current.mode).toBe('tap');

    act(() => t.current.layerMove(AWAY));
    expect(t.current.mode).toBe('tap');

    act(() => t.current.layerPress(ON_Q));
    expect(t.current.mode).toBeNull();
  });

  it('after a click closes it over the `?`, hover waits for the pointer to leave', () => {
    const t = tip();
    act(() => t.current.hoverIn(Q));
    act(() => t.current.layerPress(ON_Q));
    act(() => t.current.layerPress(ON_Q));

    act(() => t.current.hoverIn(Q));
    expect(t.current.mode).toBeNull();

    act(() => t.current.hoverOut());
    act(() => t.current.hoverIn(Q));
    expect(t.current.mode).toBe('hover');
  });

  it('a click outside closes it, and the next hover opens it again', () => {
    const t = tip();
    act(() => t.current.hoverIn(Q));
    act(() => t.current.layerPress(ON_Q));
    act(() => t.current.layerPress(AWAY));
    expect(t.current.mode).toBeNull();

    act(() => t.current.hoverIn(Q));
    expect(t.current.mode).toBe('hover');
  });

  it('the `?` box edges count as on the `?`, one pixel past does not', () => {
    const t = tip();
    act(() => t.current.hoverIn(Q));
    act(() => t.current.layerMove({ x: Q.x + Q.width, y: Q.y + Q.height }));
    expect(t.current.mode).toBe('hover');

    act(() => t.current.layerMove({ x: Q.x + Q.width + 1, y: Q.y }));
    expect(t.current.mode).toBeNull();
  });

  it('a click away from the `?` while hovering closes it', () => {
    const t = tip();
    act(() => t.current.hoverIn(Q));
    act(() => t.current.layerPress(AWAY));
    expect(t.current.mode).toBeNull();
  });
});

describe('useHelpTip — touch', () => {
  it('a tap opens it and remembers where the `?` is', () => {
    const t = tip();
    act(() => t.current.press(Q));
    expect(t.current.mode).toBe('tap');
    expect(t.current.anchor).toEqual(Q);
  });

  it('the next tap anywhere closes it', () => {
    for (const point of [ON_Q, AWAY]) {
      const t = tip();
      act(() => t.current.press(Q));
      act(() => t.current.layerPress(point));
      expect(t.current.mode).toBeNull();
    }
  });

  it('a pressed `?` closes an open tap tooltip', () => {
    const t = tip();
    act(() => t.current.press(Q));
    act(() => t.current.press(Q));
    expect(t.current.mode).toBeNull();
  });

  it('a press with no window point, as on native, closes it and leaves hover ready', () => {
    const t = tip();
    act(() => t.current.press(Q));
    act(() => t.current.layerPress(null));
    expect(t.current.mode).toBeNull();

    act(() => t.current.hoverIn(Q));
    expect(t.current.mode).toBe('hover');
  });

  it('the back gesture closes it', () => {
    const t = tip();
    act(() => t.current.press(Q));
    act(() => t.current.close());
    expect(t.current.mode).toBeNull();
  });
});
