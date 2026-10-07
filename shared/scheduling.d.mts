import type { TimeBoundary, TimeWindow } from '../src/types';
export function boundaryStamp(boundary: TimeBoundary | null, end?: boolean): number;
export function windowContains(window: TimeWindow | undefined, date: string, time: string | null, duration?: number): boolean;
