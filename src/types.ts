export type Priority = 0 | 1 | 2 | 3 | 4;
export type Theme = 'light' | 'dark' | 'system';
export interface Subtask { id: string; title: string; completed: boolean }
export interface TimeBoundary { date: string; time: string | null }
export interface TimeWindow { earliest: TimeBoundary | null; latest: TimeBoundary | null }
export interface Task {
  id: string; title: string; listId: string; completed: boolean;
  date: string | null; time: string | null; duration: number;
  priority: Priority; notes: string; subtasks: Subtask[]; reminder: boolean;
  createdAt: string; completedAt: string | null; example?: boolean;
  timeWindow?: TimeWindow;
  longTerm?: { startDate: string; doneDates: string[] };
  legacyLongTerm?: { startDate: string; doneDates: string[] };
  gameOccurrence?: { activityId: string; revision: number; periodStart: string };
}
export type ActivityKind = 'daily' | 'material' | 'weekly' | 'monthly';
export interface GameProfile {
  id: string; name: string; color: string; utcOffset: number; resetTime: string;
  weekResetDay: number; monthResetDay: number;
  category?: 'routine' | 'game';
  clock?: 'local' | 'fixed';
}
export interface GameActivity {
  id: string; gameId: string; title: string; kind: ActivityKind; weekdays: number[];
  target: number; planTime: string; planWeekday: number; planMonthDay: number;
  minutes: number; energy: number; notes: string; paused: boolean; startDate: string;
  revision: number;
  anytime?: boolean;
  timeWindow?: { earliest: string; latest: string };
}
export interface GameProgress {
  activityId: string; revision: number; periodStart: string; count: number;
  plannedAt?: string; allDay?: boolean;
}
export interface GamePlannerData { games: GameProfile[]; activities: GameActivity[]; progress: GameProgress[] }
export interface TaskList { id: string; name: string; color: string }
export interface AppData {
  version: 1; tasks: Task[]; lists: TaskList[];
  settings: { theme: Theme; glass: number };
  gaming?: GamePlannerData;
}
export type View = 'today' | 'inbox' | 'week' | 'calendar' | 'games' | 'all' | 'completed' | `list:${string}` | 'search';
export interface DesktopAPI {
  account: import('./account-types').AccountBridge;
  load: () => Promise<{ data: AppData | null; warning?: string; path: string }>;
  save: (data: AppData) => Promise<void>;
  flush: (data: AppData) => true | string;
  window: (action: 'minimize' | 'maximize' | 'close') => void;
  setTheme: (theme: Theme) => void;
  exportData: (data: AppData) => Promise<boolean>;
  importData: () => Promise<AppData | null>;
  showDataFolder: () => Promise<void>;
}
declare global { interface Window { desktop?: DesktopAPI } }
