/**
 * Root layout — fonts gate + RepositoryProvider + opaque dark base + Stack.
 *
 * Holds the splash screen until the three Google font families (one family per weight,
 * matching theme/tokens.ts) have loaded, then renders the router stack: the (tabs) group
 * (Dashboard + Today), the pushed Habit Detail and Reflection routes, and the modally-
 * presented habit-creation route. Each screen paints its OWN opaque background (via Wrap),
 * and every scene is opaque, so switching tabs/routes never leaves the old UI showing
 * through. The base View here just guards against any flash in uncovered areas.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Fraunces_400Regular,
  Fraunces_500Medium_Italic,
  Fraunces_600SemiBold,
  Fraunces_900Black,
} from '@expo-google-fonts/fraunces';
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import {
  SplineSans_400Regular,
  SplineSans_500Medium,
  SplineSans_600SemiBold,
} from '@expo-google-fonts/spline-sans';
import { RepositoryProvider } from '@/context/RepositoryContext';
import { color } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Keys here become the fontFamily strings used throughout the app (see theme/tokens.ts).
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_400Regular,
    Fraunces_500Medium_Italic,
    Fraunces_600SemiBold,
    Fraunces_900Black,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
    SplineSans_400Regular,
    SplineSans_500Medium,
    SplineSans_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null; // keep the splash up until fonts resolve
  }

  return (
    <RepositoryProvider>
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.bg },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="habit/[id]" />
          <Stack.Screen name="habit/new" options={{ presentation: 'modal' }} />
          <Stack.Screen name="reflect/[id]" />
        </Stack>
      </View>
    </RepositoryProvider>
  );
}
