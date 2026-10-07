export function boundaryStamp(boundary, end = false) {
  if (!boundary) return end ? Infinity : -Infinity;
  return new Date(`${boundary.date}T${boundary.time || (end ? '23:59' : '00:00')}:00`).getTime() + (end && !boundary.time ? 59999 : 0);
}

export function windowContains(window, date, time, duration = 0) {
  if (!window) return true;
  const start = boundaryStamp({ date, time });
  if (!time) return boundaryStamp({ date, time: null }, true) >= boundaryStamp(window.earliest) && start <= boundaryStamp(window.latest, true);
  return start >= boundaryStamp(window.earliest) && start + duration * 60000 <= boundaryStamp(window.latest, true);
}
