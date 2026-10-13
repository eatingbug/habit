import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Appearance } from 'react-native';

import { MemoryKV } from '@/data';

import { ThemeProvider, useTheme } from './ThemeProvider';

function themeWith(storage: MemoryKV) {
  return renderHook(() => useTheme(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <ThemeProvider storage={storage}>{children}</ThemeProvider>
    ),
  });
}

describe('ThemeProvider — OS 테마', () => {
  afterEach(() => jest.restoreAllMocks());

  it('follows the OS scheme when the choice is 자동', () => {
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');

    expect(themeWith(new MemoryKV()).result.current.name).toBe('dark');
  });

  it('keeps a stored choice over the OS scheme', () => {
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark');
    const storage = Object.assign(new MemoryKV(), { getSync: () => 'light' });

    expect(themeWith(storage).result.current.name).toBe('light');
  });
});
