/**
 * (tabs)/_layout — Dashboard + Today live as tabs; everything else is a pushed stack
 * route. The tab bar is styled to the demo's dark pill nav; scenes are OPAQUE (each screen
 * paints its own dark background + glow via Wrap), so switching tabs never leaves the
 * previous screen showing through.
 */
import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { color, font } from '@/theme/tokens';

function tabIcon(emoji: string) {
  return ({ color: c }: { color: ColorValue }) => <Text style={{ fontSize: 18, color: c }}>{emoji}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.bg },
        tabBarActiveTintColor: color.gold,
        tabBarInactiveTintColor: color.inkDim,
        tabBarStyle: {
          backgroundColor: color.panel,
          borderTopColor: color.line,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: font.sansSemiBold, fontSize: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '대시보드', tabBarIcon: tabIcon('🛡') }} />
      <Tabs.Screen name="today" options={{ title: '오늘', tabBarIcon: tabIcon('📅') }} />
    </Tabs>
  );
}
