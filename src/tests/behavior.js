/**
 * Behavior asserter
 * Checks if LLM output meets defined criteria.
 * This is what makes llm-test-kit a real testing framework —
 * you define what "correct" means and it checks automatically.
 *
 * Assertion types:
 *   contains      — response must include this string
 *   notContains   — response must NOT include this string
 *   minLength     — response must be at least N characters
 *   maxLength     — response must be at most N characters
 *   matchesRegex  — response must match this regex pattern
 *   customFn      — run your own function, return true/false
 */

/**
 * Run a behavior test against a provider.
 *
 * @param {Object}   options
 * @param {Object}   options.adapter      - Provider adapter
 * @param {string}   options.prompt       - Prompt to test
 * @param {Object[]} options.assertions   - Array of assertion objects
 * @param {string}   options.systemPrompt - Optional system prompt
 * @param {string}   options.model        - Optional model override
 * @returns {Promise<BehaviorResult>}
 *
 * @example
 * await testBehavior({
 *   adapter: anthropicAdapter,
 *   prompt: 'List 3 programming languages',
 *   assertions: [
 *     { type: 'contains', value: 'Python', description: 'mentions Python' },
 *     { type: 'minLength', value: 50, description: 'gives a real answer' },
 *     { type: 'notContains', value: 'I cannot', description: 'does not refuse' },
 *   ]
 * })
 */
export async function testBehavior({ adapter, prompt, assertions = [], systemPrompt, model }) {
  if (assertions.length === 0) {
    throw new Error('At least one assertion is required for a behavior test')
  }

  const result = await adapter.run({ prompt, systemPrompt, model })
  const assertionResults = assertions.map(a => runAssertion(result.content, a))

  const passed = assertionResults.every(a => a.passed)
  const failedAssertions = assertionResults.filter(a => !a.passed)

  return {
    type: 'behavior',
    provider: adapter.name,
    model: result.model,
    prompt,
    response: result.content,
    passed,
    totalAssertions: assertions.length,
    passedAssertions: assertionResults.filter(a => a.passed).length,
    failedAssertions,
    assertionResults,
    latencyMs: result.latencyMs,
    costUsd: result.costUsd,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function runAssertion(content, assertion) {
  const { type, value, description } = assertion

  try {
    let passed = false
    let detail = ''

    switch (type) {
      case 'contains':
        passed = content.toLowerCase().includes(String(value).toLowerCase())
        detail = passed ? `Found "${value}"` : `Expected to find "${value}" but it was missing`
        break

      case 'notContains':
        passed = !content.toLowerCase().includes(String(value).toLowerCase())
        detail = passed ? `Correctly absent: "${value}"` : `Expected "${value}" to be absent but it was found`
        break

      case 'minLength':
        passed = content.length >= value
        detail = `Length is ${content.length} — minimum is ${value}`
        break

      case 'maxLength':
        passed = content.length <= value
        detail = `Length is ${content.length} — maximum is ${value}`
        break

      case 'matchesRegex': {
        const regex = value instanceof RegExp ? value : new RegExp(value)
        passed = regex.test(content)
        detail = passed ? `Matched pattern ${regex}` : `Did not match pattern ${regex}`
        break
      }

      case 'customFn':
        if (typeof value !== 'function') {
          throw new Error('customFn assertion requires value to be a function')
        }
        passed = value(content)
        detail = passed ? 'Custom function returned true' : 'Custom function returned false'
        break

      default:
        throw new Error(`Unknown assertion type: ${type}`)
    }

    return {
      type,
      description: description || type,
      passed,
      detail,
    }
  } catch (err) {
    return {
      type,
      description: description || type,
      passed: false,
      detail: `Assertion error: ${err.message}`,
    }
  }
}
