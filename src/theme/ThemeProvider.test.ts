import { renderHook } from '@testing-library/react-native';
import { createElement, type ComponentProps, type ReactNode } from 'react';
import { Appearance } from 'react-native';

import { MemoryKV, type KVStore } from '@/data';

import { ThemeProvider, useTheme } from './ThemeProvider';

function wrapperFor(storage: KVStore) {
  return function Wrapper({ children }: { children: ReactNode }) {
    // `children` goes in as the third argument; the cast covers the prop it fills at runtime.
    const props = { storage } as ComponentProps<typeof ThemeProvider>;
    return createElement(ThemeProvider, props, children);
  };
}

function themeWith(storage: KVStore) {
  return renderHook(() => useTheme(), { wrapper: wrapperFor(storage) }).result.current;
}

/** A device storage holding `stored`, readable on the first render as on web. */
function storedAs(stored: string) {
  return Object.assign(new MemoryKV(), { getSync: () => stored });
}

describe('ThemeProvider — OS 테마', () => {
  let osScheme: jest.SpyInstance;

  beforeEach(() => {
    osScheme = jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');
  });

  afterEach(() => jest.restoreAllMocks());

  it('follows the OS scheme when the choice is 자동', () => {
    expect(themeWith(new MemoryKV()).name).toBe('dark');
  });

  it('keeps a stored light choice on a dark OS', () => {
    expect(themeWith(storedAs('light')).name).toBe('light');
  });

  it('keeps a stored dark choice on a light OS', () => {
    osScheme.mockReturnValue('light');

    expect(themeWith(storedAs('dark')).name).toBe('dark');
  });
});
