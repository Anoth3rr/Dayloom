import type { AccountCall, AccountSession, ApiResponse } from '../src/account-types';
export interface PrivateSession extends AccountSession { token: string }
export function accountHttp(request: AccountCall, session: PrivateSession | null, fetcher?: typeof fetch): Promise<ApiResponse>;
export function authenticatedSession(endpoint: string, body: Record<string, unknown>): PrivateSession;
export function publicSession(session: PrivateSession | null): AccountSession | null;
