const TYPE_WEIGHT = { Placement: 3, Result: 2, Event: 1 };

function recencyWeight(timestamp, minTs, maxTs) {
  const ts = new Date(timestamp).getTime();
  if (maxTs === minTs) return 1;
  return (ts - minTs) / (maxTs - minTs);
}

export function getTopN(notifications, N = 10) {
  if (!notifications.length) return [];
  const timestamps = notifications.map(n => new Date(n.Timestamp).getTime());
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  const scored = notifications.map(n => ({
    ...n,
    _score: (TYPE_WEIGHT[n.Type] ?? 1) * (1 + recencyWeight(n.Timestamp, minTs, maxTs)),
  }));

  return scored.sort((a, b) => b._score - a._score).slice(0, N);
}