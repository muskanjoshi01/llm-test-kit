/**
 * Consistency scorer
 * Runs the same prompt N times and scores how consistent
 * the responses are across runs.
 *
 * Score of 100 = identical responses every time
 * Score of 0   = completely different every time
 * Score < 70   = red flag for production apps
 */

/**
 * Score consistency across an array of response strings.
 * Uses word overlap (Jaccard similarity) averaged across all pairs.
 *
 * @param {string[]} responses - Array of response strings to compare
 * @returns {ConsistencyResult}
 */
export function scoreConsistency(responses) {
  if (responses.length < 2) {
    throw new Error('Need at least 2 responses to score consistency')
  }

  const pairs = []

  // Compare every pair of responses
  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      const similarity = jaccardSimilarity(responses[i], responses[j])
      pairs.push({ i, j, similarity })
    }
  }

  const avgSimilarity = pairs.reduce((sum, p) => sum + p.similarity, 0) / pairs.length
  const score = Math.round(avgSimilarity * 100)

  const lowestPair = pairs.reduce((min, p) => p.similarity < min.similarity ? p : min, pairs[0])
  const highestPair = pairs.reduce((max, p) => p.similarity > max.similarity ? p : max, pairs[0])

  return {
    score,
    grade: gradeScore(score),
    avgSimilarity: parseFloat(avgSimilarity.toFixed(4)),
    totalPairsCompared: pairs.length,
    lowestPair: {
      runs: [lowestPair.i + 1, lowestPair.j + 1],
      similarity: parseFloat(lowestPair.similarity.toFixed(4)),
    },
    highestPair: {
      runs: [highestPair.i + 1, highestPair.j + 1],
      similarity: parseFloat(highestPair.similarity.toFixed(4)),
    },
    passed: score >= 70,
  }
}

/**
 * Run a full consistency test against a provider.
 *
 * @param {Object} options
 * @param {Object} options.adapter      - Provider adapter (openai or anthropic)
 * @param {string} options.prompt       - Prompt to test
 * @param {number} options.runs         - Number of times to run (default: 3)
 * @param {string} options.systemPrompt - Optional system prompt
 * @param {string} options.model        - Optional model override
 * @returns {Promise<FullConsistencyResult>}
 */
export async function testConsistency({ adapter, prompt, runs = 3, systemPrompt, model }) {
  const results = []
  const errors = []

  for (let i = 0; i < runs; i++) {
    try {
      const result = await adapter.run({ prompt, systemPrompt, model })
      results.push(result)
    } catch (err) {
      errors.push({ run: i + 1, error: err.message })
    }
  }

  if (results.length < 2) {
    throw new Error(`Not enough successful runs to score consistency. ${errors.length} run(s) failed.`)
  }

  const responses = results.map(r => r.content)
  const consistency = scoreConsistency(responses)

  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0)
  const avgLatency = Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length)

  return {
    type: 'consistency',
    provider: adapter.name,
    model: results[0].model,
    prompt,
    runs: results.length,
    consistency,
    avgLatency,
    totalCost: parseFloat(totalCost.toFixed(6)),
    responses,
    errors,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Jaccard similarity between two strings.
 * Tokenizes into words, computes intersection / union.
 */
function jaccardSimilarity(a, b) {
  const setA = new Set(tokenize(a))
  const setB = new Set(tokenize(b))

  const intersection = new Set([...setA].filter(w => setB.has(w)))
  const union = new Set([...setA, ...setB])

  if (union.size === 0) return 1
  return intersection.size / union.size
}

/**
 * Tokenize a string into lowercase words, stripping punctuation.
 */
function tokenize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Convert a numeric score to a letter grade.
 */
function gradeScore(score) {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}
