/**
 * OpenAI provider adapter
 * Wraps the OpenAI SDK into the shared llm-test-kit interface.
 * Every adapter must return a NormalizedResult so the test modules
 * stay provider-agnostic.
 */

import OpenAI from 'openai'

const MODELS = {
  'gpt-4o': { inputCostPer1k: 0.005, outputCostPer1k: 0.015 },
  'gpt-4o-mini': { inputCostPer1k: 0.00015, outputCostPer1k: 0.0006 },
}

const DEFAULT_MODEL = 'gpt-4o'

export const openaiAdapter = {
  name: 'openai',

  isConfigured() {
    return !!process.env.OPENAI_API_KEY
  },

  /**
   * Send a prompt and return a NormalizedResult.
   *
   * @param {Object} options
   * @param {string} options.prompt       - The user message to send
   * @param {string} options.model        - Model ID (default: gpt-4o)
   * @param {string} options.systemPrompt - Optional system instruction
   * @param {number} options.maxTokens    - Max tokens in response
   * @returns {Promise<NormalizedResult>}
   */
  async run({ prompt, model = DEFAULT_MODEL, systemPrompt, maxTokens = 500 }) {
    if (!this.isConfigured()) {
      throw new Error('OPENAI_API_KEY is not set in your .env file')
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const resolvedModel = MODELS[model] ? model : DEFAULT_MODEL
    const meta = MODELS[resolvedModel]

    const messages = []
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
    messages.push({ role: 'user', content: prompt })

    const startTime = Date.now()

    const response = await client.chat.completions.create({
      model: resolvedModel,
      messages,
      max_tokens: maxTokens,
    })

    const latencyMs = Date.now() - startTime
    const usage = response.usage
    const content = response.choices[0].message.content

    const costUsd =
      (usage.prompt_tokens / 1000) * meta.inputCostPer1k +
      (usage.completion_tokens / 1000) * meta.outputCostPer1k

    return normalize({
      content,
      provider: 'openai',
      model: resolvedModel,
      latencyMs,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
      costUsd: parseFloat(costUsd.toFixed(6)),
      finishReason: response.choices[0].finish_reason,
    })
  },

  getSupportedModels() {
    return Object.keys(MODELS)
  },
}

/**
 * @typedef {Object} NormalizedResult
 * @property {string} content        - The model's response text
 * @property {string} provider       - Provider name
 * @property {string} model          - Model ID used
 * @property {number} latencyMs      - Time to full response in milliseconds
 * @property {Object} usage          - Token breakdown
 * @property {number} costUsd        - Estimated cost in USD
 * @property {string} finishReason   - Why the model stopped
 */
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
