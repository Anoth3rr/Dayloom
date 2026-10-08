import type { AccountSession, AccountCall, ApiResponse } from '../src/account-types';
export interface WebdavCredentials { username: string; password: string; folder?: string; name?: string }
export interface WebdavSession extends AccountSession { provider: 'webdav'; folder: string; password: string; locking: boolean }
export function normalizeWebdavEndpoint(value: string): string;
export function webdavSession(endpoint: string, input: WebdavCredentials): WebdavSession;
export function webdavDirectory(session: AccountSession): string;
export function createWebdavClient(fetcher?: typeof fetch): { call(request: AccountCall, session: WebdavSession | null): Promise<ApiResponse> };
