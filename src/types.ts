export type Priority = 0 | 1 | 2 | 3;
export type Theme = 'light' | 'dark' | 'system';
export interface Subtask { id: string; title: string; completed: boolean }
export interface Task {
  id: string; title: string; listId: string; completed: boolean;
  date: string | null; time: string | null; duration: number;
  priority: Priority; notes: string; subtasks: Subtask[]; reminder: boolean;
  createdAt: string; completedAt: string | null; example?: boolean;
}
export interface TaskList { id: string; name: string; color: string }
export interface AppData {
  version: 1; tasks: Task[]; lists: TaskList[];
  settings: { theme: Theme; glass: number };
}
export type View = 'today' | 'inbox' | 'week' | 'calendar' | 'all' | 'completed' | `list:${string}` | 'search';
export interface DesktopAPI {
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
