#!/usr/bin/env node
import { program } from 'commander'
import dotenv from 'dotenv'
import chalk from 'chalk'
import ora from 'ora'
import { openaiAdapter } from '../src/providers/openai.js'
import { anthropicAdapter } from '../src/providers/anthropic.js'
import { testConsistency } from '../src/tests/consistency.js'
import { testLatency } from '../src/tests/latency.js'
import { testCost } from '../src/tests/cost.js'
import { testBehavior } from '../src/tests/behavior.js'

dotenv.config()

program.name('llm-test').description('The missing test suite for LLM-powered applications').version('0.1.0')

function getAdapter(providerName) {
  const name = providerName || process.env.LLM_TEST_DEFAULT_PROVIDER || 'anthropic'
  if (name === 'openai') return openaiAdapter
  if (name === 'anthropic') return anthropicAdapter
  throw new Error(`Unknown provider: ${name}`)
}

function printGrade(grade, score) {
  const colors = { A: 'green', B: 'green', C: 'yellow', D: 'yellow', F: 'red' }
  return chalk[colors[grade] || 'white'](`${grade} (${score})`)
}

function printPassed(passed) {
  return passed ? chalk.green('✓ passed') : chalk.red('✗ failed')
}

program.command('ping').description('Check which providers are configured and responding').action(async () => {
  console.log(chalk.bold('\nllm-test-kit — provider ping\n'))
  const adapters = [openaiAdapter, anthropicAdapter].filter(a => a.isConfigured())
  if (adapters.length === 0) { console.log(chalk.red('No providers configured.')); process.exit(1) }
  for (const adapter of adapters) {
    const spinner = ora(`Pinging ${adapter.name}...`).start()
    try {
      const result = await adapter.run({ prompt: 'Say hello in exactly 5 words.' })
      spinner.succeed(chalk.green(`${adapter.name} ✓`))
      console.log(chalk.gray('  Response : ') + result.content.trim())
      console.log(chalk.gray('  Latency  : ') + `${result.latencyMs}ms`)
      console.log(chalk.gray('  Cost     : ') + `$${result.costUsd}`)
      console.log(chalk.gray('  Model    : ') + result.model + '\n')
    } catch (err) { spinner.fail(chalk.red(`${adapter.name} ✗ — ${err.message}\n`)) }
  }
})

program.command('run').description('Run a prompt N times').requiredOption('-p, --prompt <text>', 'Prompt to test')
  .option('--provider <name>', 'openai | anthropic').option('--model <id>', 'Model ID').option('--runs <n>', 'Number of runs', '3').option('--system <text>', 'System prompt')
  .action(async (opts) => {
    const adapter = getAdapter(opts.provider)
    const runs = parseInt(opts.runs)
    console.log(chalk.bold('\nllm-test-kit — quick run'))
    console.log(chalk.gray(`Provider : ${adapter.name}\nPrompt   : ${opts.prompt}\nRuns     : ${runs}\n`))
    const results = []
    for (let i = 1; i <= runs; i++) {
      const spinner = ora(`Run ${i} of ${runs}...`).start()
      try {
        const r = await adapter.run({ prompt: opts.prompt, model: opts.model, systemPrompt: opts.system })
        results.push(r)
        spinner.succeed(chalk.green(`Run ${i} complete`) + chalk.gray(` — ${r.latencyMs}ms — $${r.costUsd}`))
      } catch (err) { spinner.fail(chalk.red(`Run ${i} failed — ${err.message}`)) }
    }
    if (!results.length) { console.log(chalk.red('\nAll runs failed.\n')); process.exit(1) }
    console.log(chalk.bold('\nResponses\n'))
    results.forEach((r, i) => console.log(chalk.gray(`  Run ${i+1}: `) + r.content.trim().slice(0, 120)))
    console.log(chalk.bold('\nSummary\n'))
    console.log(chalk.gray('  Avg latency : ') + Math.round(results.reduce((s,r) => s+r.latencyMs,0)/results.length) + 'ms')
    console.log(chalk.gray('  Total cost  : ') + '$' + results.reduce((s,r) => s+r.costUsd,0).toFixed(6))
    console.log(chalk.gray('  Runs        : ') + `${results.length}/${runs} succeeded\n`)
  })

program.command('consistency').description('Test response consistency').requiredOption('-p, --prompt <text>', 'Prompt to test')
  .option('--provider <name>', 'openai | anthropic').option('--model <id>', 'Model ID').option('--runs <n>', 'Number of runs', '3').option('--system <text>', 'System prompt')
  .action(async (opts) => {
    const adapter = getAdapter(opts.provider)
    const spinner = ora('Running consistency test...').start()
    try {
      const result = await testConsistency({ adapter, prompt: opts.prompt, runs: parseInt(opts.runs), systemPrompt: opts.system, model: opts.model })
      spinner.stop()
      console.log(chalk.bold('\nConsistency test\n'))
      console.log(chalk.gray('  Provider    : ') + result.provider)
      console.log(chalk.gray('  Model       : ') + result.model)
      console.log(chalk.gray('  Score       : ') + printGrade(result.consistency.grade, result.consistency.score))
      console.log(chalk.gray('  Avg latency : ') + `${result.avgLatency}ms`)
      console.log(chalk.gray('  Total cost  : ') + `$${result.totalCost}`)
      console.log(chalk.gray('  Result      : ') + printPassed(result.consistency.passed))
      console.log(chalk.bold('\nResponses\n'))
      result.responses.forEach((r, i) => console.log(chalk.gray(`  Run ${i+1}: `) + r.trim().slice(0, 120)))
      if (!result.consistency.passed) console.log(chalk.yellow('\n  ⚠ Score below 70 — too inconsistent for production'))
      console.log()
    } catch (err) { spinner.fail(chalk.red(err.message)) }
  })

program.command('latency').description('Benchmark response time').requiredOption('-p, --prompt <text>', 'Prompt to benchmark')
  .option('--provider <name>', 'openai | anthropic').option('--model <id>', 'Model ID').option('--runs <n>', 'Number of runs', '5').option('--system <text>', 'System prompt')
  .action(async (opts) => {
    const adapter = getAdapter(opts.provider)
    const spinner = ora('Running latency benchmark...').start()
    try {
      const result = await testLatency({ adapter, prompt: opts.prompt, runs: parseInt(opts.runs), systemPrompt: opts.system, model: opts.model })
      spinner.stop()
      console.log(chalk.bold('\nLatency benchmark\n'))
      console.log(chalk.gray('  Provider : ') + result.provider)
      console.log(chalk.gray('  Grade    : ') + printGrade(result.grade, `${result.stats.avg}ms avg`))
      console.log(chalk.gray('  Min      : ') + `${result.stats.min}ms`)
      console.log(chalk.gray('  Max      : ') + `${result.stats.max}ms`)
      console.log(chalk.gray('  P95      : ') + `${result.stats.p95}ms`)
      console.log(chalk.gray('  Std dev  : ') + `${result.stats.stdDev}ms`)
      console.log(chalk.gray('  Result   : ') + printPassed(result.passed))
      if (!result.passed) console.log(chalk.yellow('\n  ⚠ Avg latency exceeds 4000ms'))
      console.log()
    } catch (err) { spinner.fail(chalk.red(err.message)) }
  })

program.command('cost').description('Track token usage and cost').requiredOption('-p, --prompt <text>', 'Prompt to test')
  .option('--provider <name>', 'openai | anthropic').option('--model <id>', 'Model ID').option('--runs <n>', 'Number of runs', '3').option('--budget <usd>', 'Max total cost in USD', '1.00').option('--system <text>', 'System prompt')
  .action(async (opts) => {
    const adapter = getAdapter(opts.provider)
    const spinner = ora('Running cost analysis...').start()
    try {
      const result = await testCost({ adapter, prompt: opts.prompt, runs: parseInt(opts.runs), budgetUsd: parseFloat(opts.budget), systemPrompt: opts.system, model: opts.model })
      spinner.stop()
      console.log(chalk.bold('\nCost analysis\n'))
      console.log(chalk.gray('  Provider   : ') + result.provider)
      console.log(chalk.gray('  Model      : ') + result.model)
      console.log(chalk.gray('  Total cost : ') + `$${result.totalCost}`)
      console.log(chalk.gray('  Avg cost   : ') + `$${result.avgCost} per run`)
      console.log(chalk.gray('  Avg tokens : ') + `${result.avgTokens} tokens`)
      console.log(chalk.gray('  Budget     : ') + `$${result.budgetUsd}`)
      console.log(chalk.gray('  Result     : ') + printPassed(result.passed))
      if (result.budgetExceeded) console.log(chalk.red(`\n  ✗ Budget exceeded`))
      if (result.spikes.length) console.log(chalk.yellow(`\n  ⚠ Cost spikes on runs: ${result.spikes.map(s=>s.run).join(', ')}`))
      console.log()
    } catch (err) { spinner.fail(chalk.red(err.message)) }
  })

program.command('behavior').description('Assert LLM output meets criteria').requiredOption('-p, --prompt <text>', 'Prompt to test')
  .option('--provider <name>', 'openai | anthropic').option('--model <id>', 'Model ID').option('--contains <text>', 'Must contain this').option('--not-contains <text>', 'Must NOT contain this').option('--min-length <n>', 'Min characters').option('--max-length <n>', 'Max characters').option('--system <text>', 'System prompt')
  .action(async (opts) => {
    const adapter = getAdapter(opts.provider)
    const assertions = []
    if (opts.contains) assertions.push({ type: 'contains', value: opts.contains, description: `contains "${opts.contains}"` })
    if (opts.notContains) assertions.push({ type: 'notContains', value: opts.notContains, description: `does not contain "${opts.notContains}"` })
    if (opts.minLength) assertions.push({ type: 'minLength', value: parseInt(opts.minLength), description: `at least ${opts.minLength} chars` })
    if (opts.maxLength) assertions.push({ type: 'maxLength', value: parseInt(opts.maxLength), description: `at most ${opts.maxLength} chars` })
    if (!assertions.length) { console.log(chalk.red('\nAdd at least one assertion e.g. --contains "Python"\n')); process.exit(1) }
    const spinner = ora('Running behavior test...').start()
    try {
      const result = await testBehavior({ adapter, prompt: opts.prompt, assertions, systemPrompt: opts.system, model: opts.model })
      spinner.stop()
      console.log(chalk.bold('\nBehavior test\n'))
      console.log(chalk.gray('  Provider   : ') + result.provider)
      console.log(chalk.gray('  Assertions : ') + `${result.passedAssertions}/${result.totalAssertions} passed`)
      console.log(chalk.gray('  Latency    : ') + `${result.latencyMs}ms`)
      console.log(chalk.gray('  Cost       : ') + `$${result.costUsd}`)
      console.log(chalk.gray('  Result     : ') + printPassed(result.passed))
      console.log(chalk.bold('\nAssertions\n'))
      result.assertionResults.forEach(a => {
        const icon = a.passed ? chalk.green('  ✓') : chalk.red('  ✗')
        console.log(`${icon} ${a.description}`)
        if (!a.passed) console.log(chalk.gray(`    ${a.detail}`))
      })
      console.log(chalk.bold('\nResponse\n'))
      console.log(chalk.gray('  ' + result.response.trim().slice(0, 300)) + '\n')
    } catch (err) { spinner.fail(chalk.red(err.message)) }
  })

program.parse()