/**
 * Cost regression checker
 * Tracks token usage and cost across runs.
 * Alerts when cost spikes beyond a defined threshold — 
 * catches runaway prompts before they drain your budget.
 */

/**
 * Run a cost regression test against a provider.
 *
 * @param {Object} options
 * @param {Object} options.adapter          - Provider adapter
 * @param {string} options.prompt           - Prompt to test
 * @param {number} options.runs             - Number of runs (default: 3)
 * @param {number} options.budgetUsd        - Max allowed total cost in USD
 * @param {number} options.maxCostPerRun    - Max allowed cost per single run in USD
 * @param {string} options.systemPrompt     - Optional system prompt
 * @param {string} options.model            - Optional model override
 * @returns {Promise<CostResult>}
 */
export async function testCost({
  adapter,
  prompt,
  runs = 3,
  budgetUsd = parseFloat(process.env.LLM_TEST_BUDGET_USD || '1.00'),
  maxCostPerRun,
  systemPrompt,
  model,
}) {
  const results = []
  const errors = []
  let cumulativeCost = 0

  for (let i = 0; i < runs; i++) {
    // Stop early if we've already exceeded the budget
    if (cumulativeCost >= budgetUsd) {
      errors.push({
        run: i + 1,
        error: `Budget of $${budgetUsd} exceeded after ${i} run(s) — stopping early`,
      })
      break
    }

    try {
      const result = await adapter.run({ prompt, systemPrompt, model })
      results.push(result)
      cumulativeCost += result.costUsd
    } catch (err) {
      errors.push({ run: i + 1, error: err.message })
    }
  }

  if (results.length === 0) {
    throw new Error('All runs failed — cannot analyze cost')
  }

  const costs = results.map(r => r.costUsd)
  const tokens = results.map(r => r.usage.totalTokens)

  const totalCost = parseFloat(costs.reduce((a, b) => a + b, 0).toFixed(6))
  const avgCost = parseFloat((totalCost / costs.length).toFixed(6))
  const avgTokens = Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length)
  const maxCost = Math.max(...costs)
  const minCost = Math.min(...costs)

  // Detect cost spikes — flag if any run costs 2x the average
  const spikes = results
    .filter(r => r.costUsd > avgCost * 2)
    .map((r, i) => ({ run: i + 1, cost: r.costUsd }))

  const budgetExceeded = totalCost > budgetUsd
  const perRunExceeded = maxCostPerRun ? maxCost > maxCostPerRun : false

  return {
    type: 'cost',
    provider: adapter.name,
    model: results[0].model,
    prompt,
    runs: results.length,
    totalCost,
    avgCost,
    avgTokens,
    maxCost,
    minCost,
    budgetUsd,
    budgetExceeded,
    perRunExceeded,
    spikes,
    passed: !budgetExceeded && !perRunExceeded && spikes.length === 0,
    errors,
  }
}
