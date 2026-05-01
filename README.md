# llm-test-kit

> The missing test suite for LLM-powered applications.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

Most developers building AI-powered apps have no idea if their LLM is giving consistent answers, how much it costs per request, or whether it's actually behaving the way they expect. They find out when something breaks in production.

`llm-test-kit` fixes that.

---

## What it does

Run four tests against any prompt across OpenAI and Anthropic:

| Test | What it measures |
|---|---|
| **Consistency** | How much do responses vary across runs? Scores 0–100 with a letter grade |
| **Latency** | Min, max, avg, p95 response time. Flags when it's too slow for production |
| **Cost** | Token usage and spend per run. Stops early if you exceed your budget |
| **Behavior** | Assert that output meets your criteria — contains a word, hits a length, matches a pattern |

Then generate a visual HTML report with one command.

---

## Install

```bash
npm install -g llm-test-kit
```

Or clone and run locally:

```bash
git clone https://github.com/muskanjoshi01/llm-test-kit.git
cd llm-test-kit
npm install
cp .env.example .env
# Add your API keys to .env
```

---

## Quick start

**Check your providers are connected:**
```bash
node bin/cli.js ping
```

**Run all 4 tests and get an HTML report:**
```bash
node bin/report.js -p "What is an API?" --runs 3 --contains "interface"
open report.html
```

**Run individual tests:**
```bash
# Consistency — how stable are responses across runs?
node bin/cli.js consistency -p "Explain APIs" --runs 3

# Latency — how fast is it?
node bin/cli.js latency -p "Explain APIs" --runs 5

# Cost — what does it cost per run?
node bin/cli.js cost -p "Explain APIs" --runs 3 --budget 0.50

# Behavior — does it meet your criteria?
node bin/cli.js behavior -p "List 3 languages" --contains "Python" --min-length 50
```

---

## Real results

Running `llm-test-kit` against Claude Sonnet on "What is an API?":

```
Consistency score : D (60) — content consistent, formatting varies
Latency avg       : 6823ms — Grade F for this prompt length
Cost total        : $0.014418 across 3 runs — zero spikes
Behavior          : 2/2 assertions passed
```

The consistency finding is the interesting one: Claude gives the same answer every time but structures it differently. Add a system prompt telling it to use plain text and the score jumps to an A. That's the kind of insight `llm-test-kit` is built to surface.

---

## CLI reference

### `ping`
Check which providers are configured and responding.
```bash
node bin/cli.js ping
```

### `consistency`
Run the same prompt N times and score how consistent the responses are.
```bash
node bin/cli.js consistency -p "Your prompt" --runs 3 --provider anthropic
```
Score of 100 = identical every time. Score below 70 = too inconsistent for production.

### `latency`
Benchmark response time across multiple runs.
```bash
node bin/cli.js latency -p "Your prompt" --runs 5
```
Reports min, max, avg, p50, p95, and standard deviation.

### `cost`
Track token usage and cost per run. Stops early if budget is exceeded.
```bash
node bin/cli.js cost -p "Your prompt" --runs 3 --budget 0.50
```

### `behavior`
Assert that output meets defined criteria.
```bash
node bin/cli.js behavior -p "Your prompt" \
  --contains "Python" \
  --not-contains "I cannot" \
  --min-length 50 \
  --max-length 500
```

### `report`
Run all 4 tests and generate a visual HTML dashboard.
```bash
node bin/report.js -p "Your prompt" --runs 3 --output report.html
open report.html
```

---

## Options

All commands support these flags:

| Flag | Description | Default |
|---|---|---|
| `--provider` | `openai` or `anthropic` | Value from `.env` |
| `--model` | Model ID to use | Provider default |
| `--runs` | Number of runs | 3 |
| `--system` | System prompt | None |

---

## Configuration

Copy `.env.example` to `.env` and fill in your keys:

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Default provider: openai | anthropic
LLM_TEST_DEFAULT_PROVIDER=anthropic

# Max cost per test suite run
LLM_TEST_BUDGET_USD=1.00
```

You only need one key to get started.

---

## Supported providers and models

| Provider | Models |
|---|---|
| Anthropic | claude-sonnet-4-6, claude-opus-4-6 |
| OpenAI | gpt-4o, gpt-4o-mini |

---

## Why I built this

Every team building AI-powered apps eventually asks the same questions:

- Why is our LLM giving different answers to the same question?
- Why did our API costs spike this month?
- How do we know if a model update broke our expected behavior?

There was no clean open source tool to answer these. `llm-test-kit` is that tool.

---

## Roadmap

- [ ] Google Gemini and Groq provider support
- [ ] Compare two providers side by side
- [ ] CI/CD integration — fail the build if consistency drops
- [ ] JSON output for programmatic use
- [ ] Watch mode — run tests on a schedule

---

## Contributing

PRs are very welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Found a bug or have a feature idea? [Open an issue](https://github.com/muskanjoshi01/llm-test-kit/issues).

---

## License

MIT — use this freely in personal and commercial projects.

---

Built by [Muskan Joshi](https://github.com/muskanjoshi01) 

If this saved you time, a ⭐ on GitHub goes a long way.
