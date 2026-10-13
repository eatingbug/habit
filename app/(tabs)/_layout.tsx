import { Tabs, router } from 'expo-router';
import { LayoutGrid, NotebookPen, Sun, type LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_LABELS } from '@/config/copy';
import { TODAY_HREF } from '@/hooks/useToday';
import { TYPE } from '@/theme/redesignTokens';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Tab bar — SPEC §6.1, the `.tabbar` at the bottom of `ReToday`, `ReDashboard` and
 * `ReJournal`. Three tabs in order: 오늘, 대시보드, 글 모음. Redesign tokens only.
 *
 * `index` keeps the Dashboard at `/` and `today` keeps `/today`, so every existing link
 * still lands. Habit Detail, New habit, Reflection and Settings stay root Stack routes.
 */

/** `.tabbar button` is `min-height:56px` (over `TAP_TARGET`) inside `padding:4px 0 10px`. */
const ITEM_HEIGHT = 56;
const PAD_TOP = 4;
const PAD_BOTTOM = 10;

export default function TabsLayout() {
  const { redesign } = useTheme();
  const insets = useSafeAreaInsets();

  // The navigator's `color` is a `ColorValue`; Lucide takes a string, so the icon picks
  // the same two tokens from `focused`.
  const tabIcon = (Icon: LucideIcon) =>
    function TabIcon({ focused }: { focused: boolean }) {
      return (
        <Icon size={24} strokeWidth={2} color={focused ? redesign.accentInk : redesign.muted} />
      );
    };

  return (
    <Tabs
      screenOptions={{
        // Each screen draws its own title (§6.2, §6.3), so there is no navigator header.
        headerShown: false,
        sceneStyle: { paddingTop: insets.top, backgroundColor: redesign.bg },
        tabBarActiveTintColor: redesign.accentInk,
        tabBarInactiveTintColor: redesign.muted,
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { ...TYPE.label, marginTop: 2 },
        tabBarItemStyle: { minHeight: ITEM_HEIGHT },
        tabBarStyle: {
          backgroundColor: redesign.surface,
          borderTopColor: redesign.border,
          borderTopWidth: 1,
          paddingTop: PAD_TOP,
          paddingBottom: PAD_BOTTOM + insets.bottom,
          height: PAD_TOP + ITEM_HEIGHT + PAD_BOTTOM + insets.bottom,
        },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: TAB_LABELS.today,
          tabBarAccessibilityLabel: TAB_LABELS.today,
          tabBarIcon: tabIcon(Sun),
        }}
        // The default press keeps the tab's params, so a date from 글 모음 would stick.
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.navigate(TODAY_HREF);
          },
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: TAB_LABELS.dashboard,
          tabBarAccessibilityLabel: TAB_LABELS.dashboard,
          tabBarIcon: tabIcon(LayoutGrid),
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: TAB_LABELS.journal,
          tabBarAccessibilityLabel: TAB_LABELS.journal,
          tabBarIcon: tabIcon(NotebookPen),
        }}
      />
    </Tabs>
  );
}
