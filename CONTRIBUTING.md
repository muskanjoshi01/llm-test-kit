# Contributing to llm-test-kit

First off — thank you. Every contribution, no matter how small, makes this tool better for everyone building LLM-powered applications.

## Ways to contribute

- **Report a bug** — open an issue describing what happened and what you expected
- **Suggest a feature** — open an issue with your idea and why it would be useful
- **Fix a bug** — pick an open issue, comment that you're working on it, and open a PR
- **Add a new test module** — see the guide below
- **Improve the docs** — fix typos, clarify instructions, add examples

---

## Getting started

### 1. Fork and clone

```bash
git clone https://github.com/YOUR_USERNAME/llm-test-kit.git
cd llm-test-kit
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up your environment

```bash
cp .env.example .env
# Add at least one API key to .env
```

### 4. Verify everything works

```bash
node bin/cli.js ping
```

You should see at least one provider responding.

---

## How the codebase is structured

```
llm-test-kit/
├── bin/
│   ├── cli.js        — CLI entry point, all commands defined here
│   └── report.js     — HTML report generator
├── src/
│   ├── providers/    — One file per LLM provider
│   │   ├── openai.js
│   │   └── anthropic.js
│   ├── tests/        — One file per test module
│   │   ├── consistency.js
│   │   ├── latency.js
│   │   ├── cost.js
│   │   └── behavior.js
│   └── index.js      — Public API exports
└── .env.example
```

---

## Adding a new provider

Each provider must implement the same interface so test modules stay provider-agnostic.

Create a new file in `src/providers/yourprovider.js`:

```js
export const yourProvider = {
  name: 'yourprovider',

  isConfigured() {
    return !!process.env.YOUR_PROVIDER_API_KEY
  },

  async run({ prompt, model, systemPrompt, maxTokens = 500 }) {
    // Call your provider's API here
    // Must return a NormalizedResult:
    return {
      content,       // string — the model's response
      provider,      // string — your provider name
      model,         // string — model ID used
      latencyMs,     // number — time to full response
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      costUsd,       // number — estimated cost
      finishReason,  // string — why the model stopped
    }
  },

  getSupportedModels() {
    return ['your-model-id']
  },
}
```

Then register it in `src/providers/index.js` and add it to the CLI in `bin/cli.js`.

---

## Adding a new test module

Create a new file in `src/tests/yourtest.js`. Export a main function that:

- Accepts `{ adapter, prompt, ...options }`
- Calls `adapter.run()` one or more times
- Returns a result object with at least `{ type, provider, passed }`

Then add a new CLI command in `bin/cli.js` following the same pattern as the existing commands.

---

## Pull request guidelines

- **One PR per feature or fix** — keep changes focused
- **Describe what you changed and why** in the PR description
- **Test your changes** — run `node bin/cli.js ping` and the relevant command before submitting
- **Follow the existing code style** — no semicolons, single quotes, ES modules

---

## Reporting bugs

Open an issue and include:

- What command you ran
- What you expected to happen
- What actually happened
- Your Node.js version (`node --version`)
- Which provider you were using

---

## Questions?

Open an issue tagged `question` — no question is too small.

---

Thank you for helping make `llm-test-kit` better. Every contribution matters.
