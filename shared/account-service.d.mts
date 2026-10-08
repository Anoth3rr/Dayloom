import type { AccountSession, AccountCall, ApiResponse } from '../src/account-types';
import type { PrivateSession } from './account-http.mjs';
import type { WebdavSession } from './webdav.mjs';
export type AccountVault = { version: 1; active: string | null; accounts: (PrivateSession | WebdavSession)[] };
export function profileKey(session: AccountSession): string;
export function publicAccount(session: PrivateSession | WebdavSession | null): AccountSession | null;
export function createAccountService(options: { load(): { value: unknown; remembered: boolean } | null; save(value: AccountVault): boolean; fetcher?: typeof fetch }): { session(): AccountSession | null; active(): PrivateSession | WebdavSession | null; call(request: AccountCall): Promise<ApiResponse> };
