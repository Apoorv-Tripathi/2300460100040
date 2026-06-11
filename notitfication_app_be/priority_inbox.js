const API_URL = "http://4.224.186.213/evaluation-service/notifications";

const TYPE_WEIGHT = { Placement: 3, Result: 2, Event: 1 };

function recencyWeight(timestamp, minTs, maxTs) {
  const ts = new Date(timestamp).getTime();
  if (maxTs === minTs) return 1;
  return (ts - minTs) / (maxTs - minTs);
}

function score(n, minTs, maxTs) {
  const tw = TYPE_WEIGHT[n.Type] ?? 1;
  const rw = recencyWeight(n.Timestamp, minTs, maxTs);
  return tw * (1 + rw);
}

// Min-heap to maintain top N efficiently — O(log N) per insert
class MinHeap {
  constructor() { this.h = []; }
  size() { return this.h.length; }
  min() { return this.h[0]; }
  push(item) {
    this.h.push(item);
    let i = this.h.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.h[p].score <= this.h[i].score) break;
      [this.h[p], this.h[i]] = [this.h[i], this.h[p]];
      i = p;
    }
  }
  pop() {
    const top = this.h[0];
    const last = this.h.pop();
    if (this.h.length > 0) {
      this.h[0] = last;
      let i = 0;
      while (true) {
        let s = i, l = 2*i+1, r = 2*i+2;
        if (l < this.h.length && this.h[l].score < this.h[s].score) s = l;
        if (r < this.h.length && this.h[r].score < this.h[s].score) s = r;
        if (s === i) break;
        [this.h[s], this.h[i]] = [this.h[i], this.h[s]];
        i = s;
      }
    }
    return top;
  }
}

async function getTopN(N = 10) {
  const res = await fetch(API_URL);
  const json = await res.json();

  console.log("API response:", JSON.stringify(json).slice(0, 200));

  const notifications = Array.isArray(json)
    ? json
    : json.notifications ?? json.data ?? json.results ?? [];

  if (!notifications.length) {
    console.log("Empty or unrecognised response shape:", json);
    return [];
  }

  const timestamps = notifications.map(n => new Date(n.Timestamp).getTime());
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  const heap = new MinHeap();
  for (const n of notifications) {
    const s = score(n, minTs, maxTs);
    if (heap.size() < N) heap.push({ score: s, n });
    else if (s > heap.min().score) { heap.pop(); heap.push({ score: s, n }); }
  }

  const result = [];
  while (heap.size() > 0) result.push(heap.pop());
  return result.sort((a, b) => b.score - a.score);
}

(async () => {
  const top10 = await getTopN(10);
  console.log("\nTOP 10 PRIORITY NOTIFICATIONS\n");
  top10.forEach((item, i) => {
    console.log(`#${i+1} [${item.n.Type}] ${item.n.Message}`);
    console.log(`    ${item.n.Timestamp}  |  score: ${item.score.toFixed(3)}\n`);
  });
})();