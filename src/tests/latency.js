/**
 * Latency benchmarker
 * Measures response time patterns across multiple runs.
 * Flags when latency is too high or too inconsistent for production use.
 *
 * Thresholds:
 *   < 1000ms  = Fast (A)
 *   < 2000ms  = Acceptable (B)
 *   < 4000ms  = Slow (C)
 *   < 6000ms  = Very slow (D)
 *   >= 6000ms = Unacceptable (F)
 */

/**
 * Run a full latency benchmark against a provider.
 *
 * @param {Object} options
 * @param {Object} options.adapter      - Provider adapter
 * @param {string} options.prompt       - Prompt to benchmark
 * @param {number} options.runs         - Number of runs (default: 5)
 * @param {string} options.systemPrompt - Optional system prompt
 * @param {string} options.model        - Optional model override
 * @returns {Promise<LatencyResult>}
 */
export async function testLatency({ adapter, prompt, runs = 5, systemPrompt, model }) {
  const latencies = []
  const errors = []

  for (let i = 0; i < runs; i++) {
    try {
      const result = await adapter.run({ prompt, systemPrompt, model })
      latencies.push(result.latencyMs)
    } catch (err) {
      errors.push({ run: i + 1, error: err.message })
    }
  }

  if (latencies.length === 0) {
    throw new Error('All runs failed — cannot benchmark latency')
  }

  const stats = computeStats(latencies)

  return {
    type: 'latency',
    provider: adapter.name,
    prompt,
    runs: latencies.length,
    stats,
    grade: gradeLatency(stats.avg),
    passed: stats.avg < 4000,
    latencies,
    errors,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeStats(latencies) {
  const sorted = [...latencies].sort((a, b) => a - b)
  const sum = latencies.reduce((a, b) => a + b, 0)
  const avg = Math.round(sum / latencies.length)
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const p50 = percentile(sorted, 50)
  const p95 = percentile(sorted, 95)

  // Standard deviation — measures consistency of latency
  const variance = latencies.reduce((sum, l) => sum + Math.pow(l - avg, 2), 0) / latencies.length
  const stdDev = Math.round(Math.sqrt(variance))

  return { avg, min, max, p50, p95, stdDev }
}

function percentile(sorted, p) {
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

function gradeLatency(avgMs) {
  if (avgMs < 1000) return 'A'
  if (avgMs < 2000) return 'B'
  if (avgMs < 4000) return 'C'
  if (avgMs < 6000) return 'D'
  return 'F'
}
