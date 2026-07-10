/**
 * Root layout — ThemeProvider + RepositoryProvider + themed shell + Stack.
 *
 * The app uses system fonts (no custom font gate). ThemeProvider resolves the adaptive
 * light/dark palette (SPEC §6.0); the inner Shell reads it for the StatusBar and the
 * Stack's opaque background. Each screen paints its own opaque background (via Wrap), so
 * switching tabs/routes never leaves the old UI showing through.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { ToastProvider } from '@/context/ToastContext';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider>
      <RepositoryProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </RepositoryProvider>
    </ThemeProvider>
  );
}

function Shell() {
  const { colors, scheme } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="habit/[id]" />
        <Stack.Screen name="habit/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="reflect/[id]" />
      </Stack>
    </View>
  );
}
