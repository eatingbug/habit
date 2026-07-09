/**
 * (tabs)/_layout — Dashboard + Today live as tabs; everything else is a pushed stack
 * route. The tab bar is styled to the demo's dark pill nav; scenes are OPAQUE (each screen
 * paints its own dark background + glow via Wrap), so switching tabs never leaves the
 * previous screen showing through.
 */
import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { font, weight } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

function tabIcon(emoji: string) {
  return ({ color: c }: { color: ColorValue }) => <Text style={{ fontSize: 18, color: c }}>{emoji}</Text>;
}

export default function TabsLayout() {
  const { colors: c } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.bg },
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: font.sans, fontWeight: weight.semibold, fontSize: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '대시보드', tabBarIcon: tabIcon('🛡') }} />
      <Tabs.Screen name="today" options={{ title: '오늘', tabBarIcon: tabIcon('📅') }} />
    </Tabs>
  );
}
