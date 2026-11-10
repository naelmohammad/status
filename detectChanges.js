export function detectChanges(prevResults, currResults, sendTelegram) {
  const prevMap = new Map();
  if (prevResults && Array.isArray(prevResults.results)) {
    for (const r of prevResults.results) {
      prevMap.set(r.url, r.status);
    }
  }
  const changes = [];
  for (const r of currResults) {
    const prevStatus = prevMap.get(r.url);
    const currStatus = r.status;
    const prevError = prevMap.get(r.url) === undefined ? null : prevStatus;
    const changed = prevStatus !== undefined && prevStatus !== currStatus;
    if (changed) {
      changes.push({url: r.url, prevStatus, currStatus, timestamp: r.timestamp});
      const newState = currStatus && currStatus >= 200 && currStatus < 400 ? 'up' : 'down';
      sendTelegram(r.url, newState, r.timestamp);
    }
  }
  return changes;
}
