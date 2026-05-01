#!/usr/bin/env node
/**
 * llm-test-kit CLI
 * Usage: llm-test run [options]
 */

import { program } from 'commander'
import dotenv from 'dotenv'
import chalk from 'chalk'
import ora from 'ora'
import { openaiAdapter } from '../src/providers/openai.js'
import { anthropicAdapter } from '../src/providers/anthropic.js'

dotenv.config()

program
  .name('llm-test')
  .description('The missing test suite for LLM-powered applications')
  .version('0.1.0')

/**
 * llm-test ping
 * Quick sanity check — sends "Say hello." to each configured provider
 * and prints the response, latency, and cost.
 */
program
  .command('ping')
  .description('Check which providers are configured and responding')
  .action(async () => {
    console.log(chalk.bold('\nllm-test-kit — provider ping\n'))

    const adapters = [openaiAdapter, anthropicAdapter]
    const configured = adapters.filter(a => a.isConfigured())

    if (configured.length === 0) {
      console.log(chalk.red('No providers configured. Add your API keys to .env'))
      console.log(chalk.gray('See .env.example for the required keys\n'))
      process.exit(1)
    }

    for (const adapter of configured) {
      const spinner = ora(`Pinging ${adapter.name}...`).start()

      try {
        const result = await adapter.run({ prompt: 'Say hello in exactly 5 words.' })
        spinner.succeed(chalk.green(`${adapter.name} ✓`))
        console.log(chalk.gray(`  Response : `) + result.content.trim())
        console.log(chalk.gray(`  Latency  : `) + `${result.latencyMs}ms`)
        console.log(chalk.gray(`  Cost     : `) + `$${result.costUsd}`)
        console.log(chalk.gray(`  Model    : `) + result.model)
        console.log()
      } catch (err) {
        spinner.fail(chalk.red(`${adapter.name} ✗ — ${err.message}`))
        console.log()
      }
    }
  })

/**
 * llm-test run --prompt "..." --provider openai --runs 3
 * Runs a single prompt N times and reports consistency + cost.
 */
program
  .command('run')
  .description('Run a prompt and report consistency, latency, and cost')
  .requiredOption('-p, --prompt <text>', 'The prompt to test')
  .option('--provider <name>', 'Provider to use (openai | anthropic)', process.env.LLM_TEST_DEFAULT_PROVIDER || 'openai')
  .option('--model <id>', 'Model ID to use')
  .option('--runs <n>', 'Number of times to run the prompt', '3')
  .option('--system <text>', 'Optional system prompt')
  .action(async (opts) => {
    const adapter = opts.provider === 'anthropic' ? anthropicAdapter : openaiAdapter

    if (!adapter.isConfigured()) {
      console.log(chalk.red(`\n${opts.provider} is not configured. Add your API key to .env\n`))
      process.exit(1)
    }

    const runs = parseInt(opts.runs)
    console.log(chalk.bold(`\nllm-test-kit — consistency run`))
    console.log(chalk.gray(`Provider : ${opts.provider}`))
    console.log(chalk.gray(`Prompt   : ${opts.prompt}`))
    console.log(chalk.gray(`Runs     : ${runs}\n`))

    const results = []

    for (let i = 1; i <= runs; i++) {
      const spinner = ora(`Run ${i} of ${runs}...`).start()

      try {
        const result = await adapter.run({
          prompt: opts.prompt,
          model: opts.model,
          systemPrompt: opts.system,
        })
        results.push(result)
        spinner.succeed(chalk.green(`Run ${i} complete`) + chalk.gray(` — ${result.latencyMs}ms — $${result.costUsd}`))
      } catch (err) {
        spinner.fail(chalk.red(`Run ${i} failed — ${err.message}`))
      }
    }

    if (results.length === 0) {
      console.log(chalk.red('\nAll runs failed.\n'))
      process.exit(1)
    }

    // Summary
    const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0)
    const avgLatency = Math.round(results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length)
    const avgTokens = Math.round(results.reduce((sum, r) => sum + r.usage.totalTokens, 0) / results.length)

    console.log(chalk.bold('\nResults\n'))
    results.forEach((r, i) => {
      console.log(chalk.gray(`  Run ${i + 1}: `) + r.content.trim().slice(0, 120))
    })

    console.log(chalk.bold('\nSummary\n'))
    console.log(chalk.gray('  Avg latency : ') + `${avgLatency}ms`)
    console.log(chalk.gray('  Avg tokens  : ') + `${avgTokens}`)
    console.log(chalk.gray('  Total cost  : ') + `$${totalCost.toFixed(6)}`)
    console.log(chalk.gray('  Runs        : ') + `${results.length}/${runs} succeeded`)
    console.log()
  })

program.parse()
