import type { AppData } from './types';
export interface AccountUser { id: string; username: string; name: string }
export interface AccountSession { endpoint: string; user: AccountUser; expiresAt: number; remembered?: boolean }
export interface PendingSync { id: string; revision: number; data: AppData }
export interface WorkspaceEnvelope { version: 1; data: AppData; sync: { revision: number; base: AppData; pending?: PendingSync; lastSyncedAt?: number } }
export interface ApiResponse { status: number; body: Record<string, unknown> }
export type AccountOperation = 'register' | 'login' | 'pull' | 'push' | 'password' | 'logout';
export interface AccountCall { operation: AccountOperation; endpoint?: string; body?: unknown; revision?: number }
export interface AccountBridge {
  session: () => Promise<AccountSession | null>;
  call: (request: AccountCall) => Promise<ApiResponse>;
  loadProfile: (key: string) => Promise<{ envelope: WorkspaceEnvelope | null; path: string; warning?: string }>;
  saveProfile: (key: string, envelope: WorkspaceEnvelope) => Promise<void>;
  flushProfile: (key: string, envelope: WorkspaceEnvelope) => true | string;
}
export interface WorkspaceAdapter extends AccountBridge {
  loadGuest: () => Promise<{ data: AppData; path: string; warning?: string }>;
  saveGuest: (data: AppData) => Promise<void>;
  flushGuest: (data: AppData) => true | string;
}
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'pending' | 'offline' | 'expired' | 'error';
export interface WorkspaceState {
  data: AppData | null; session: AccountSession | null; path: string;
  saveStatus: string; syncStatus: SyncStatus; syncError: string;
  lastSyncedAt?: number; busy: boolean; loadError: string;
  notice?: { id: number; message: string };
}
