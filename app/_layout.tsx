import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { RepositoryProvider } from '@/context/RepositoryContext';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function Shell() {
  const { name, colors } = useTheme();
  return (
    <>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.surface },
        }}
      >
        <Stack.Screen name="today" options={{ title: '오늘' }} />
        <Stack.Screen name="habit/new" options={{ title: '습관 만들기' }} />
        <Stack.Screen name="habit/[id]" options={{ title: '습관' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      {/* Persistence lives above every screen — the provider defaults to
          `new LocalRepository(createKVStore())`, so this mount is the whole wiring (§8). */}
      <RepositoryProvider>
        <Shell />
      </RepositoryProvider>
    </ThemeProvider>
  );
}
