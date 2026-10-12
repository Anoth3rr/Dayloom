import type { Task, TimeBoundary, TimeWindow } from './types';
export function isDeadline(task: Task): boolean;
export function boundaryStamp(boundary: TimeBoundary | null, end?: boolean): number;
export function windowContains(window: TimeWindow | undefined, date: string, time: string | null, duration?: number): boolean;
