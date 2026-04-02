# Self-Improvement Plugin for Paperclip

Tracks agent run outcomes, detects failure patterns, and generates improvement suggestions for [Paperclip](https://github.com/paperclipai/paperclip) agent teams.

## What it does

Monitors agent performance over time and surfaces actionable insights:

- **Run tracking** — records success/failure/timeout for every agent run
- **Pattern detection** — identifies agents with high failure rates, frequent timeouts, empty summaries, or high costs
- **Improvement suggestions** — generates specific recommendations based on detected patterns
- **Delivery modes** — posts suggestions as issue comments or appends to agent instructions

## Features

- **Dashboard widget** — success rate, total runs, cost, agents needing attention
- **Agent detail tab** — per-agent stats, suggestions, error patterns, recent runs
- **Settings page** — stats overview, manual analysis trigger, data management
- **Periodic analysis** — configurable interval for automatic pattern detection
- **Anti-spam** — hashes suggestions to avoid duplicate delivery

## Installation

```bash
cd /path/to/paperclip/.paperclip/plugins
npm install @animusystems/paperclip-plugin-self-improve
```

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | Enable/disable tracking |
| `analysisIntervalMinutes` | `60` | How often to run pattern analysis |
| `minRunsForAnalysis` | `5` | Minimum runs before generating suggestions |
| `failureThresholdPercent` | `40` | Failure rate that triggers suggestions |
| `deliveryMode` | `comments` | How to deliver suggestions: `comments`, `instructions`, or `disabled` |

## Required capabilities

```
events.subscribe, plugin.state.read, plugin.state.write,
agents.read, issues.read, issues.create, issues.update,
issue.comments.read, issue.comments.create,
activity.log.write, http.outbound
```

## License

MIT
