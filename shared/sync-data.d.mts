import type { AppData } from '../src/types';
import type { WorkspaceEnvelope } from '../src/account-types';
export function emptyData(): AppData;
export function canonical(value: unknown): string;
export function equal(a: unknown, b: unknown): boolean;
export function normalizeEndpoint(value: string): string;
export function assertEnvelope(value: unknown): WorkspaceEnvelope;
export function mergeData(base: AppData, local: AppData, remote: AppData, makeId?: () => string): { data: AppData; conflicts: number };
