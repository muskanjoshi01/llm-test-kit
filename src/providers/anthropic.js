/**
 * Anthropic provider adapter
 * Wraps the Anthropic SDK into the shared llm-test-kit interface.
 * Returns the same NormalizedResult shape as the OpenAI adapter
 * so test modules stay provider-agnostic.
 */

import Anthropic from '@anthropic-ai/sdk'

const MODELS = {
  'claude-sonnet-4-6': { inputCostPer1k: 0.003, outputCostPer1k: 0.015 },
  'claude-opus-4-6': { inputCostPer1k: 0.015, outputCostPer1k: 0.075 },
}

const DEFAULT_MODEL = 'claude-sonnet-4-6'

export const anthropicAdapter = {
  name: 'anthropic',

  isConfigured() {
    return !!process.env.ANTHROPIC_API_KEY
  },

  /**
   * Send a prompt and return a NormalizedResult.
   *
   * @param {Object} options
   * @param {string} options.prompt       - The user message to send
   * @param {string} options.model        - Model ID (default: claude-sonnet-4-6)
   * @param {string} options.systemPrompt - Optional system instruction
   * @param {number} options.maxTokens    - Max tokens in response
   * @returns {Promise<NormalizedResult>}
   */
  async run({ prompt, model = DEFAULT_MODEL, systemPrompt, maxTokens = 500 }) {
    if (!this.isConfigured()) {
      throw new Error('ANTHROPIC_API_KEY is not set in your .env file')
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resolvedModel = MODELS[model] ? model : DEFAULT_MODEL
    const meta = MODELS[resolvedModel]

    const requestParams = {
      model: resolvedModel,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }

    // Anthropic keeps system prompts separate from the messages array
    if (systemPrompt) requestParams.system = systemPrompt

    const startTime = Date.now()

    const response = await client.messages.create(requestParams)

    const latencyMs = Date.now() - startTime

    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('')

    const usage = response.usage
    const costUsd =
      (usage.input_tokens / 1000) * meta.inputCostPer1k +
      (usage.output_tokens / 1000) * meta.outputCostPer1k

    return normalize({
      content,
      provider: 'anthropic',
      model: resolvedModel,
      latencyMs,
      usage: {
        promptTokens: usage.input_tokens,
        completionTokens: usage.output_tokens,
        totalTokens: usage.input_tokens + usage.output_tokens,
      },
      costUsd: parseFloat(costUsd.toFixed(6)),
      finishReason: response.stop_reason,
    })
  },

  getSupportedModels() {
    return Object.keys(MODELS)
  },
}

function normalize(data) {
  return {
    content: data.content,
    provider: data.provider,
    model: data.model,
    latencyMs: data.latencyMs,
    usage: data.usage,
    costUsd: data.costUsd,
    finishReason: data.finishReason,
  }
}
