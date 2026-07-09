/**
 * components/types.ts — the shared UI contract.
 *
 * Component prop interfaces + the view-model shapes that cross the hook → screen →
 * component boundary. Both the presentational components and the screens import from
 * here, so TypeScript enforces that they agree (the anti-drift backbone for Phase 4).
 *
 * Pure types only — no runtime. Domain enums are re-aliased where a component shares a
 * name with a domain type (e.g. the StatusLight component vs. the StatusLight union).
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type {
  DayState,
  DiagnosisFlag as DiagnosisFlagData,
  Habit,
  LogType,
  ReflectionAction,
  SkipReason,
  StatusLight as StatusLightState,
} from '@/models';
import type { HeatState } from '@/theme/heatLevel';

// ── View-models (built by hooks, consumed by screens/components) ───────────────

export interface StatCardData {
  id: string;
  icon: string;
  name: string;
  level: number;
  xp: number;
  toNextLabel: string; // e.g. '→ Lv 13 · 960 to go'  (or 'max level')
  progress: number; // 0..1 fill toward next level
}

export interface HabitRowData {
  id: string;
  name: string;
  statName: string;
  cue?: string;
  streak: number;
  light: StatusLightState;
  cells: HeatState[]; // most-recent-last, length === heatmap columns
}

export interface TallyData {
  quests: string; // 'done/total'
  logs: number;
  xp: number;
}

export type FeedEntry =
  | {
      kind: 'habit';
      id: string;
      habitId: string; // owning habit (lets the composer reopen this entry for editing)
      timestamp: string;
      time: string; // 'HH:MM' local
      habitName: string;
      statName: string;
      dayState: DayState; // the day's COMPUTED state (all rows of a habit's day share it)
      isSkip: boolean; // this row is a skip (actual === 0)
      isMiss: boolean; // the DAY is a diagnostic miss (non-exception skip, no activity)
      actual: number;
      unit: string;
      isBinary?: boolean; // yes/no habit → render "✓ done" instead of "N unit"
      note?: string;
      skipReason?: SkipReason; // present on skip rows (restores the skip picker on edit)
      xp?: number; // the day's XP contribution — set only on the latest activity row
    }
  | {
      kind: 'log';
      id: string;
      timestamp: string;
      time: string;
      type: LogType;
      text: string;
    };

export interface MirrorDay {
  weekday: string; // single letter
  state: 'over' | 'ok' | 'miss' | 'blank';
  value: string; // actual amount or '–'
}

export interface JournalItem {
  id: string;
  date: string; // raw 'YYYY-MM-DD' (used to reopen the entry for editing)
  dateLabel: string; // 'Jun 07'
  dayState: DayState; // the day's COMPUTED state
  isSkip: boolean; // this row is a skip (actual === 0)
  actual: number;
  unit: string;
  isBinary?: boolean; // yes/no habit → drop the numeric count from the chip label
  note?: string;
  skipReason?: SkipReason; // present on skip rows
  isMiss: boolean; // the DAY is a diagnostic miss
}

export interface ActionOption {
  action: ReflectionAction;
  icon: string;
  title: string;
  desc: string;
}

/** Pre-fill values handed to the composer when reopening a record for editing. */
export interface ComposerInitial {
  target: string; // 'free' or a habitId
  hour: string;
  minute: string;
  logType?: LogType;
  count?: string;
  note?: string;
  skipMode?: boolean;
  skipReason?: SkipReason;
}

/** What the unified composer emits; the Today screen converts it to a stored record. */
export type ComposerSubmit =
  | { kind: 'log'; type: LogType; text: string; hour: string; minute: string }
  | { kind: 'entry'; habitId: string; actual: number; note?: string; hour: string; minute: string }
  | {
      kind: 'skip';
      habitId: string;
      skipReason: SkipReason;
      note?: string;
      hour: string;
      minute: string;
    };

// ── Component props ────────────────────────────────────────────────────────────

export interface WrapProps {
  children: ReactNode;
  scroll?: boolean; // wrap content in a ScrollView (default true)
}
export interface PanelProps {
  title?: string;
  sub?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}
export interface SectionLabelProps {
  children: ReactNode;
}
export interface TagProps {
  children: ReactNode;
}
export interface PillProps {
  n: string | number;
  label: string;
}
export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}
export interface ToastProps {
  message: string;
  visible: boolean;
}
export interface EmptyStateProps {
  children: ReactNode;
}
export interface BrandHeaderProps {
  level?: number; // shows the level ring badge when provided
  role?: string;
  name?: string;
}

export interface TextFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
  multiline?: boolean;
  grow?: boolean; // flex:1 within a row
}
export interface NumberFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
}
export interface StatPickerProps {
  value: string; // statId
  onValueChange: (statId: string) => void;
}
export interface TimePickerProps {
  hour: string;
  minute: string;
  onHourChange: (hour: string) => void;
  onMinuteChange: (minute: string) => void;
}
export interface TypeChipsProps {
  value: LogType;
  onChange: (type: LogType) => void;
}
export interface SkipReasonPickerProps {
  value: SkipReason;
  onValueChange: (reason: SkipReason) => void;
}

export interface LevelRingProps {
  value: number;
  size?: number;
  progress?: number; // 0..1 arc fill (default 0.75 like the demo)
}
export interface XPBarProps {
  progress: number; // 0..1
}
export interface StatCardProps {
  data: StatCardData;
}
export interface TallyProps {
  data: TallyData;
}

export interface StatusLightProps {
  light: StatusLightState;
  onPress?: () => void;
  size?: number;
}
export interface StreakProps {
  count: number;
}
export interface HeatmapProps {
  cells: HeatState[];
  onCellPress?: (index: number) => void;
  columns?: number; // default 20
}
export type HeatLegendProps = Record<string, never>;
export interface HabitRowProps {
  data: HabitRowData;
  onPress: () => void;
  onLightPress: () => void;
}

export interface MirrorWeekProps {
  days: MirrorDay[];
}
export interface DiagnosisFlagProps {
  flag: DiagnosisFlagData;
}
export interface ActionCardProps {
  icon: string;
  title: string;
  desc: string;
  selected: boolean;
  onPress: () => void;
}
export interface ActionGridProps {
  actions: ActionOption[];
  selected: ReflectionAction | null;
  onSelect: (action: ReflectionAction) => void;
}

export interface FeedItemProps {
  item: FeedEntry;
  onPress?: () => void; // tap the row to edit this record
}
export interface JournalEntryProps {
  item: JournalItem;
  onPress?: () => void; // tap the entry to edit it
}
export interface DesignBoxProps {
  cue?: string;
  floor: number;
  floorUnit: string;
  identity?: string;
  kind?: 'count' | 'binary'; // binary → the floor cell reads "Yes / No"
  onEdit?: () => void;
}

export interface ComposerProps {
  habits: Habit[];
  onSubmit: (submission: ComposerSubmit) => void;
  initial?: ComposerInitial; // pre-fill for editing an existing record
  editing?: boolean; // edit mode: lock the target, show "수정" + cancel
  onCancel?: () => void;
}
