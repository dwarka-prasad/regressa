/**
 * Rolling-baseline anomaly detection. Given the value for the current window and the values of the
 * preceding windows, report the z-score of the current value against the baseline distribution.
 */
export interface AnomalyResult { zScore: number; mean: number; stddev: number; anomalous: boolean; sample: number }

export function detectAnomaly(current: number, history: number[], opts: { zThreshold?: number; minHistory?: number; direction?: "up" | "down" | "both" } = {}): AnomalyResult {
  const z = opts.zThreshold ?? 3;
  const minHistory = opts.minHistory ?? 6;
  const direction = opts.direction ?? "both";
  const n = history.length;
  if (n < minHistory) return { zScore: 0, mean: 0, stddev: 0, anomalous: false, sample: n };
  const mean = history.reduce((a, b) => a + b, 0) / n;
  const variance = history.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  // Floor the stddev at a fraction of the mean so a perfectly flat history doesn't fire on any blip.
  const stddev = Math.max(Math.sqrt(variance), Math.abs(mean) * 0.05, 1e-9);
  const zScore = (current - mean) / stddev;
  const anomalous = direction === "up" ? zScore >= z : direction === "down" ? zScore <= -z : Math.abs(zScore) >= z;
  return { zScore, mean, stddev, anomalous, sample: n };
}
