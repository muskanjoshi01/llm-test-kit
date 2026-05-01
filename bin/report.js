#!/usr/bin/env node
/**
 * llm-test-kit — HTML report generator
 * Runs all 4 test modules and saves a visual dashboard as report.html
 *
 * Usage: node bin/report.js -p "Your prompt here"
 */

import { program } from 'commander'
import dotenv from 'dotenv'
import ora from 'ora'
import fs from 'fs'
import path from 'path'
import { openaiAdapter } from '../src/providers/openai.js'
import { anthropicAdapter } from '../src/providers/anthropic.js'
import { testConsistency } from '../src/tests/consistency.js'
import { testLatency } from '../src/tests/latency.js'
import { testCost } from '../src/tests/cost.js'
import { testBehavior } from '../src/tests/behavior.js'

dotenv.config()

program
  .name('llm-test-report')
  .description('Run all 4 tests and generate an HTML report')
  .requiredOption('-p, --prompt <text>', 'The prompt to test')
  .option('--provider <name>', 'Provider to use (openai | anthropic)')
  .option('--runs <n>', 'Number of runs per test', '3')
  .option('--output <file>', 'Output file name', 'report.html')
  .option('--contains <text>', 'Behavior assertion: must contain this text')
  .option('--system <text>', 'Optional system prompt')
  .parse()

const opts = program.opts()

const adapter = (() => {
  const name = opts.provider || process.env.LLM_TEST_DEFAULT_PROVIDER || 'anthropic'
  if (name === 'openai') return openaiAdapter
  if (name === 'anthropic') return anthropicAdapter
  throw new Error(`Unknown provider: ${name}`)
})()

if (!adapter.isConfigured()) {
  console.error(`Provider ${adapter.name} is not configured. Check your .env file.`)
  process.exit(1)
}

const runs = parseInt(opts.runs)
const results = {}

console.log(`\nllm-test-kit — generating report`)
console.log(`Provider : ${adapter.name}`)
console.log(`Prompt   : ${opts.prompt}`)
console.log(`Runs     : ${runs}\n`)

// ─── Run all 4 tests ─────────────────────────────────────────────────────────

const s1 = ora('Running consistency test...').start()
try {
  results.consistency = await testConsistency({ adapter, prompt: opts.prompt, runs, systemPrompt: opts.system })
  s1.succeed(`Consistency — score: ${results.consistency.consistency.score} (${results.consistency.consistency.grade})`)
} catch (err) {
  s1.fail(`Consistency failed: ${err.message}`)
  results.consistency = null
}

const s2 = ora('Running latency benchmark...').start()
try {
  results.latency = await testLatency({ adapter, prompt: opts.prompt, runs, systemPrompt: opts.system })
  s2.succeed(`Latency — avg: ${results.latency.stats.avg}ms (${results.latency.grade})`)
} catch (err) {
  s2.fail(`Latency failed: ${err.message}`)
  results.latency = null
}

const s3 = ora('Running cost analysis...').start()
try {
  results.cost = await testCost({ adapter, prompt: opts.prompt, runs, systemPrompt: opts.system })
  s3.succeed(`Cost — total: $${results.cost.totalCost}`)
} catch (err) {
  s3.fail(`Cost failed: ${err.message}`)
  results.cost = null
}

const assertions = []
if (opts.contains) assertions.push({ type: 'contains', value: opts.contains, description: `contains "${opts.contains}"` })
assertions.push({ type: 'minLength', value: 20, description: 'at least 20 characters' })

const s4 = ora('Running behavior test...').start()
try {
  results.behavior = await testBehavior({ adapter, prompt: opts.prompt, assertions, systemPrompt: opts.system })
  s4.succeed(`Behavior — ${results.behavior.passedAssertions}/${results.behavior.totalAssertions} assertions passed`)
} catch (err) {
  s4.fail(`Behavior failed: ${err.message}`)
  results.behavior = null
}

// ─── Generate HTML ────────────────────────────────────────────────────────────

const gradeColor = g => ({ A: '#22c55e', B: '#86efac', C: '#facc15', D: '#fb923c', F: '#ef4444' }[g] || '#888')
const passColor = p => p ? '#22c55e' : '#ef4444'
const passLabel = p => p ? '✓ passed' : '✗ failed'

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>llm-test-kit report</title>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap" rel="stylesheet"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0f;
    --surface: #111118;
    --border: #1e1e2e;
    --text: #e2e2f0;
    --muted: #6b6b8a;
    --accent: #7c6af7;
    --pass: #22c55e;
    --fail: #ef4444;
    --warn: #facc15;
  }

  body {
    font-family: 'IBM Plex Sans', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    padding: 0;
  }

  header {
    border-bottom: 1px solid var(--border);
    padding: 32px 48px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
  }

  .logo {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 13px;
    color: var(--accent);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .header-meta {
    text-align: right;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    line-height: 1.8;
  }

  .prompt-bar {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 20px 48px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    color: var(--muted);
  }

  .prompt-bar span {
    color: var(--text);
    font-weight: 500;
  }

  main { padding: 48px; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
    margin-bottom: 48px;
  }

  .card {
    background: var(--surface);
    padding: 32px;
    position: relative;
    overflow: hidden;
  }

  .card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: var(--card-accent, var(--accent));
  }

  .card-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 20px;
  }

  .card-score {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 48px;
    font-weight: 500;
    line-height: 1;
    margin-bottom: 8px;
    color: var(--score-color, var(--text));
  }

  .card-grade {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 13px;
    color: var(--muted);
    margin-bottom: 24px;
  }

  .card-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 3px;
    font-family: 'IBM Plex Mono', monospace;
  }

  .status-pass { background: rgba(34,197,94,0.1); color: var(--pass); }
  .status-fail { background: rgba(239,68,68,0.1); color: var(--fail); }

  .section {
    margin-bottom: 48px;
  }

  .section-title {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
  }

  .stat {
    background: var(--surface);
    padding: 20px 24px;
  }

  .stat-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .stat-value {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 20px;
    font-weight: 500;
    color: var(--text);
  }

  .responses {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
  }

  .response-item {
    background: var(--surface);
    padding: 16px 24px;
    display: flex;
    gap: 16px;
    align-items: flex-start;
  }

  .response-num {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--accent);
    min-width: 40px;
    padding-top: 2px;
  }

  .response-text {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text);
    opacity: 0.8;
  }

  .assertions {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
  }

  .assertion-item {
    background: var(--surface);
    padding: 16px 24px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
  }

  .assertion-icon { font-size: 14px; }
  .assertion-pass { color: var(--pass); }
  .assertion-fail { color: var(--fail); }

  .bar-chart { display: flex; flex-direction: column; gap: 8px; }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
  }

  .bar-label { color: var(--muted); min-width: 60px; }

  .bar-track {
    flex: 1;
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
    transition: width 0.6s ease;
  }

  .bar-value { color: var(--text); min-width: 70px; text-align: right; }

  footer {
    border-top: 1px solid var(--border);
    padding: 24px 48px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>

<header>
  <div>
    <div class="logo">llm-test-kit</div>
    <div style="font-size:22px;font-weight:300;margin-top:6px;">Test Report</div>
  </div>
  <div class="header-meta">
    <div>Provider: ${adapter.name}</div>
    <div>Model: ${results.consistency?.model || results.latency?.provider || adapter.name}</div>
    <div>Generated: ${new Date().toLocaleString()}</div>
    <div>Runs: ${runs} per test</div>
  </div>
</header>

<div class="prompt-bar">
  prompt / <span>${opts.prompt}</span>
</div>

<main>

  <!-- Summary cards -->
  <div class="grid">
    ${results.consistency ? `
    <div class="card" style="--card-accent: ${gradeColor(results.consistency.consistency.grade)}">
      <div class="card-label">Consistency</div>
      <div class="card-score" style="--score-color: ${gradeColor(results.consistency.consistency.grade)}">${results.consistency.consistency.score}</div>
      <div class="card-grade">Grade ${results.consistency.consistency.grade} · ${results.consistency.runs} runs</div>
      <span class="card-status ${results.consistency.consistency.passed ? 'status-pass' : 'status-fail'}">${passLabel(results.consistency.consistency.passed)}</span>
    </div>` : '<div class="card"><div class="card-label">Consistency</div><div class="card-grade">Test failed</div></div>'}

    ${results.latency ? `
    <div class="card" style="--card-accent: ${gradeColor(results.latency.grade)}">
      <div class="card-label">Latency</div>
      <div class="card-score" style="--score-color: ${gradeColor(results.latency.grade)}">${results.latency.stats.avg}<span style="font-size:20px;font-weight:300">ms</span></div>
      <div class="card-grade">Grade ${results.latency.grade} · avg response time</div>
      <span class="card-status ${results.latency.passed ? 'status-pass' : 'status-fail'}">${passLabel(results.latency.passed)}</span>
    </div>` : '<div class="card"><div class="card-label">Latency</div><div class="card-grade">Test failed</div></div>'}

    ${results.cost ? `
    <div class="card" style="--card-accent: ${passColor(results.cost.passed)}">
      <div class="card-label">Cost</div>
      <div class="card-score" style="--score-color: ${passColor(results.cost.passed)}">$${results.cost.totalCost}</div>
      <div class="card-grade">${results.cost.avgTokens} avg tokens · ${results.cost.runs} runs</div>
      <span class="card-status ${results.cost.passed ? 'status-pass' : 'status-fail'}">${passLabel(results.cost.passed)}</span>
    </div>` : '<div class="card"><div class="card-label">Cost</div><div class="card-grade">Test failed</div></div>'}

    ${results.behavior ? `
    <div class="card" style="--card-accent: ${passColor(results.behavior.passed)}">
      <div class="card-label">Behavior</div>
      <div class="card-score" style="--score-color: ${passColor(results.behavior.passed)}">${results.behavior.passedAssertions}/${results.behavior.totalAssertions}</div>
      <div class="card-grade">assertions passed</div>
      <span class="card-status ${results.behavior.passed ? 'status-pass' : 'status-fail'}">${passLabel(results.behavior.passed)}</span>
    </div>` : '<div class="card"><div class="card-label">Behavior</div><div class="card-grade">Test failed</div></div>'}
  </div>

  <!-- Latency details -->
  ${results.latency ? `
  <div class="section">
    <div class="section-title">Latency breakdown</div>
    <div class="stats-grid">
      <div class="stat"><div class="stat-label">Min</div><div class="stat-value">${results.latency.stats.min}ms</div></div>
      <div class="stat"><div class="stat-label">Avg</div><div class="stat-value">${results.latency.stats.avg}ms</div></div>
      <div class="stat"><div class="stat-label">Max</div><div class="stat-value">${results.latency.stats.max}ms</div></div>
      <div class="stat"><div class="stat-label">P50</div><div class="stat-value">${results.latency.stats.p50}ms</div></div>
      <div class="stat"><div class="stat-label">P95</div><div class="stat-value">${results.latency.stats.p95}ms</div></div>
      <div class="stat"><div class="stat-label">Std dev</div><div class="stat-value">${results.latency.stats.stdDev}ms</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Latency per run</div>
    <div class="bar-chart" style="background:var(--surface);border:1px solid var(--border);padding:24px;">
      ${results.latency.latencies.map((l, i) => `
      <div class="bar-row">
        <div class="bar-label">Run ${i + 1}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round((l / results.latency.stats.max) * 100)}%"></div></div>
        <div class="bar-value">${l}ms</div>
      </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- Consistency responses -->
  ${results.consistency ? `
  <div class="section">
    <div class="section-title">Consistency — responses</div>
    <div class="responses">
      ${results.consistency.responses.map((r, i) => `
      <div class="response-item">
        <div class="response-num">run ${i + 1}</div>
        <div class="response-text">${r.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 400)}</div>
      </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- Behavior assertions -->
  ${results.behavior ? `
  <div class="section">
    <div class="section-title">Behavior assertions</div>
    <div class="assertions">
      ${results.behavior.assertionResults.map(a => `
      <div class="assertion-item">
        <span class="assertion-icon ${a.passed ? 'assertion-pass' : 'assertion-fail'}">${a.passed ? '✓' : '✗'}</span>
        <span style="color:${a.passed ? 'var(--pass)' : 'var(--fail)'}">${a.description}</span>
        ${!a.passed ? `<span style="color:var(--muted);margin-left:auto">${a.detail}</span>` : ''}
      </div>`).join('')}
    </div>
    <div style="background:var(--surface);border:1px solid var(--border);border-top:0;padding:20px 24px;">
      <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;">Response</div>
      <div style="font-size:13px;line-height:1.7;color:var(--text);opacity:0.8">${results.behavior.response.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 600)}</div>
    </div>
  </div>` : ''}

  <!-- Cost details -->
  ${results.cost ? `
  <div class="section">
    <div class="section-title">Cost breakdown</div>
    <div class="stats-grid">
      <div class="stat"><div class="stat-label">Total cost</div><div class="stat-value">$${results.cost.totalCost}</div></div>
      <div class="stat"><div class="stat-label">Avg per run</div><div class="stat-value">$${results.cost.avgCost}</div></div>
      <div class="stat"><div class="stat-label">Avg tokens</div><div class="stat-value">${results.cost.avgTokens}</div></div>
      <div class="stat"><div class="stat-label">Budget</div><div class="stat-value">$${results.cost.budgetUsd}</div></div>
      <div class="stat"><div class="stat-label">Spikes</div><div class="stat-value" style="color:${results.cost.spikes.length ? 'var(--warn)' : 'var(--pass)'}">${results.cost.spikes.length}</div></div>
      <div class="stat"><div class="stat-label">Runs</div><div class="stat-value">${results.cost.runs}</div></div>
    </div>
  </div>` : ''}

</main>

<footer>
  <span>llm-test-kit · github.com/muskanjoshi01/llm-test-kit</span>
  <span>${new Date().toISOString()}</span>
</footer>

</body>
</html>`

const outputPath = path.resolve(opts.output)
fs.writeFileSync(outputPath, html)
console.log(`\nReport saved → ${outputPath}`)
console.log(`Open it in your browser: open ${opts.output}\n`)
