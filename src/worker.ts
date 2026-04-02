import { definePlugin, startWorkerRpcHost } from "@paperclipai/plugin-sdk";

// ── Types ────────────────────────────────────────────────────────

interface RunRecord {
  runId: string;
  agentId: string;
  agentName: string;
  status: "succeeded" | "failed" | "timed_out" | "cancelled";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  error: string | null;
  errorCode: string | null;
  issueTitle: string | null;
  summary: string | null;
}

interface AgentPerformance {
  agentId: string;
  agentName: string;
  totalRuns: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  successRate: number;
  avgDurationMs: number;
  avgTokensPerRun: number;
  totalCostUsd: number;
  recentErrors: Array<{ error: string; count: number }>;
  suggestions: string[];
  lastAnalyzedAt: string;
}

interface PluginState {
  runs: RunRecord[];
  performances: Record<string, AgentPerformance>;
  lastAnalysisAt: string | null;
}

// ── Constants ────────────────────────────────────────────────────

const STATE_KEY = "self-improve-data";
const MAX_RUNS_STORED = 500;

const DATA_KEYS = {
  OVERVIEW: "self-improve-overview",
  AGENT_DETAIL: "self-improve-agent-detail",
  CONFIG: "self-improve-config",
};

const ACTION_KEYS = {
  ANALYZE_NOW: "analyze-now",
  CLEAR_DATA: "clear-data",
};

// ── Helpers ──────────────────────────────────────────────────────

function emptyState(): PluginState {
  return { runs: [], performances: {}, lastAnalysisAt: null };
}

function categorizeError(error: string | null, errorCode: string | null): string {
  if (!error) return "unknown";
  const e = error.toLowerCase();
  if (e.includes("timeout") || e.includes("timed out")) return "timeout";
  if (e.includes("api") || e.includes("openrouter") || e.includes("429") || e.includes("rate")) return "api_error";
  if (e.includes("permission") || e.includes("unauthorized") || e.includes("401") || e.includes("403")) return "auth_error";
  if (e.includes("tool") || e.includes("function")) return "tool_error";
  if (e.includes("cannot read") || e.includes("undefined") || e.includes("null")) return "runtime_crash";
  if (errorCode) return errorCode;
  return "other";
}

function generateSuggestions(perf: AgentPerformance, runs: RunRecord[]): string[] {
  const suggestions: string[] = [];
  const agentRuns = runs.filter((r) => r.agentId === perf.agentId);
  const recentRuns = agentRuns.slice(-20);

  // High failure rate
  if (perf.successRate < 70 && perf.totalRuns >= 5) {
    suggestions.push(
      `Success rate is ${perf.successRate.toFixed(0)}% (${perf.failed} failures out of ${perf.totalRuns} runs). Review agent instructions for clarity.`,
    );
  }

  // Timeout pattern
  const timeouts = recentRuns.filter((r) => r.status === "timed_out");
  if (timeouts.length >= 2) {
    suggestions.push(
      `${timeouts.length} timeouts in recent runs. Consider increasing timeoutSec or reducing task scope.`,
    );
  }

  // Empty summary pattern (agent not producing output)
  const emptySummaries = recentRuns.filter((r) => r.status === "succeeded" && (!r.summary || r.summary.includes("[Auto-summary]")));
  if (emptySummaries.length >= 3) {
    suggestions.push(
      `${emptySummaries.length} recent runs completed without a proper summary. The agent may be hitting the turn limit without wrapping up. Consider increasing maxTurns.`,
    );
  }

  // High cost runs
  const highCostRuns = recentRuns.filter((r) => r.costUsd > 0.10);
  if (highCostRuns.length >= 3) {
    suggestions.push(
      `${highCostRuns.length} runs cost over $0.10 each. The agent may be reading too many files. Consider adding focused instructions about which files to examine.`,
    );
  }

  // Repeated errors
  for (const err of perf.recentErrors) {
    if (err.count >= 3) {
      suggestions.push(
        `Recurring error (${err.count}x): "${err.error}". This pattern should be investigated.`,
      );
    }
  }

  // API errors
  const apiErrors = recentRuns.filter((r) => categorizeError(r.error, r.errorCode) === "api_error");
  if (apiErrors.length >= 3) {
    suggestions.push(
      `${apiErrors.length} API errors in recent runs. Check model availability and rate limits.`,
    );
  }

  // Delegation pattern (CTO/CEO doing IC work)
  const longRuns = recentRuns.filter((r) => r.durationMs > 120000 && r.inputTokens > 200000);
  if (longRuns.length >= 2) {
    const agent = perf.agentName.toLowerCase();
    if (agent.includes("cto") || agent.includes("ceo") || agent.includes("cfo") || agent.includes("cmo")) {
      suggestions.push(
        `${longRuns.length} recent runs consumed 200K+ tokens. As a manager role, this agent may be doing IC work instead of delegating. Review delegation instructions.`,
      );
    }
  }

  return suggestions;
}

function analyzePerformance(state: PluginState, minRuns: number): Record<string, AgentPerformance> {
  const byAgent: Record<string, RunRecord[]> = {};
  for (const run of state.runs) {
    if (!byAgent[run.agentId]) byAgent[run.agentId] = [];
    byAgent[run.agentId].push(run);
  }

  const performances: Record<string, AgentPerformance> = {};

  for (const [agentId, runs] of Object.entries(byAgent)) {
    if (runs.length < minRuns) continue;

    const succeeded = runs.filter((r) => r.status === "succeeded").length;
    const failed = runs.filter((r) => r.status === "failed").length;
    const timedOut = runs.filter((r) => r.status === "timed_out").length;
    const totalDuration = runs.reduce((sum, r) => sum + r.durationMs, 0);
    const totalTokens = runs.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);
    const totalCost = runs.reduce((sum, r) => sum + r.costUsd, 0);

    // Count error categories
    const errorCounts: Record<string, number> = {};
    for (const r of runs) {
      if (r.error) {
        const cat = categorizeError(r.error, r.errorCode);
        errorCounts[cat] = (errorCounts[cat] || 0) + 1;
      }
    }
    const recentErrors = Object.entries(errorCounts)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const perf: AgentPerformance = {
      agentId,
      agentName: runs[0].agentName,
      totalRuns: runs.length,
      succeeded,
      failed,
      timedOut,
      successRate: runs.length > 0 ? (succeeded / runs.length) * 100 : 0,
      avgDurationMs: runs.length > 0 ? totalDuration / runs.length : 0,
      avgTokensPerRun: runs.length > 0 ? totalTokens / runs.length : 0,
      totalCostUsd: totalCost,
      recentErrors,
      suggestions: [],
      lastAnalyzedAt: new Date().toISOString(),
    };

    perf.suggestions = generateSuggestions(perf, runs);
    performances[agentId] = perf;
  }

  return performances;
}

// ── Delivery: Comments ───────────────────────────────────────────
// Posts suggestions as a comment on the agent's most recent active issue

async function deliverViaComments(ctx: any, companyId: string, perf: AgentPerformance) {
  // Find the agent's active issues
  const issues = await ctx.issues.list({
    companyId,
    assigneeAgentId: perf.agentId,
    status: "in_progress,todo",
    limit: 1,
  });

  if (!issues || issues.length === 0) return;

  const issueId = issues[0].id;
  const body = formatSuggestionsMarkdown(perf, "comment");

  await ctx.issues.createComment(issueId, body, companyId);
}

// ── Delivery: Instructions ───────────────────────────────────────
// Appends suggestions to the agent's AGENTS.md instructions file
// via the internal Paperclip API (instructions-bundle endpoint)

async function deliverViaInstructions(ctx: any, companyId: string, perf: AgentPerformance) {
  // Read current instructions via the bundle API
  const agent = await ctx.agents.get(perf.agentId, companyId);
  if (!agent) return;

  const bundleRes = await ctx.http.fetch(
    `http://localhost:${process.env.PORT || "3100"}/api/agents/${perf.agentId}/instructions-bundle/file?path=AGENTS.md&companyId=${companyId}`,
  );

  if (!bundleRes.ok) {
    ctx.logger.warn(`Could not read AGENTS.md for ${perf.agentName}: ${bundleRes.status}`);
    return;
  }

  const fileData = await bundleRes.json() as { content?: string };
  const currentContent = fileData.content ?? "";

  // Remove any previous self-improvement section
  const sectionMarker = "## Self-Improvement Learnings";
  const cleanContent = currentContent.includes(sectionMarker)
    ? currentContent.substring(0, currentContent.indexOf(sectionMarker)).trimEnd()
    : currentContent.trimEnd();

  // Append new suggestions
  const newSection = formatSuggestionsMarkdown(perf, "instructions");
  const updatedContent = `${cleanContent}\n\n${newSection}\n`;

  // Write back via the API
  const writeRes = await ctx.http.fetch(
    `http://localhost:${process.env.PORT || "3100"}/api/agents/${perf.agentId}/instructions-bundle/file?companyId=${companyId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "AGENTS.md", content: updatedContent }),
    },
  );

  if (!writeRes.ok) {
    ctx.logger.warn(`Could not update AGENTS.md for ${perf.agentName}: ${writeRes.status}`);
  }
}

// ── Format suggestions ──────────────────────────────────────────

function formatSuggestionsMarkdown(perf: AgentPerformance, mode: "comment" | "instructions"): string {
  const date = new Date().toISOString().split("T")[0];

  if (mode === "comment") {
    const lines = [
      `**Performance Review** (auto-generated ${date})`,
      "",
      `Success rate: **${perf.successRate.toFixed(0)}%** (${perf.succeeded}/${perf.totalRuns} runs)`,
      "",
      "**Suggestions for improvement:**",
      ...perf.suggestions.map((s) => `- ${s}`),
      "",
      "_This review was generated by the Self-Improvement plugin based on your recent run history._",
    ];
    return lines.join("\n");
  }

  // Instructions mode — structured for the agent to follow
  const lines = [
    `## Self-Improvement Learnings`,
    `_Auto-updated ${date} based on performance analysis of ${perf.totalRuns} runs (${perf.successRate.toFixed(0)}% success rate)._`,
    "",
    ...perf.suggestions.map((s) => `- ${s}`),
  ];
  return lines.join("\n");
}

// ── Plugin ───────────────────────────────────────────────────────

const plugin = definePlugin({
  async setup(ctx) {
    const config = await ctx.config.get();
    const enabled = config?.enabled !== false;

    if (!enabled) {
      ctx.logger.info("Self-improvement tracking is disabled");
      return;
    }

    ctx.logger.info("Self-improvement plugin started");

    // ── Track run completions ──────────────────────────────────

    async function recordRun(event: any) {
      const payload = event.payload ?? {};
      const run = payload.run ?? payload;

      const status = run.status;
      if (!["succeeded", "failed", "timed_out", "cancelled"].includes(status)) return;

      const agentId = run.agentId ?? event.agentId;
      const companyId = run.companyId ?? event.companyId;
      if (!agentId || !companyId) return;

      let agentName = "Unknown";
      try {
        const agent = await ctx.agents.get(agentId, companyId);
        if (agent) agentName = agent.name;
      } catch {}

      const usage = run.usageJson ?? {};
      const record: RunRecord = {
        runId: run.id ?? event.entityId ?? "",
        agentId,
        agentName,
        status,
        startedAt: run.startedAt ?? event.occurredAt ?? "",
        finishedAt: run.finishedAt ?? new Date().toISOString(),
        durationMs: run.startedAt && run.finishedAt
          ? new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()
          : 0,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        costUsd: run.costUsd ?? 0,
        error: run.error ?? null,
        errorCode: run.errorCode ?? null,
        issueTitle: null,
        summary: run.summary ?? run.stdoutExcerpt?.slice(0, 200) ?? null,
      };

      // Load state, append run, trim to max
      const state: PluginState = (await ctx.state.get({
        scopeKind: "company",
        scopeId: companyId,
        stateKey: STATE_KEY,
      })) ?? emptyState();

      state.runs.push(record);
      if (state.runs.length > MAX_RUNS_STORED) {
        state.runs = state.runs.slice(-MAX_RUNS_STORED);
      }

      await ctx.state.set(
        { scopeKind: "company", scopeId: companyId, stateKey: STATE_KEY },
        state,
      );
    }

    ctx.events.on("agent.run.finished", recordRun);
    ctx.events.on("agent.run.failed", recordRun);
    ctx.events.on("agent.run.cancelled", recordRun);

    // ── Periodic analysis job ──────────────────────────────────

    ctx.jobs.register("analyze-performance", async () => {
      const minRuns = (config?.minRunsForAnalysis as number) ?? 5;

      const companies = await ctx.companies.list();
      for (const company of companies) {
        const state: PluginState = (await ctx.state.get({
          scopeKind: "company",
          scopeId: company.id,
          stateKey: STATE_KEY,
        })) ?? emptyState();

        if (state.runs.length < minRuns) continue;

        const performances = analyzePerformance(state, minRuns);
        state.performances = performances;
        state.lastAnalysisAt = new Date().toISOString();

        await ctx.state.set(
          { scopeKind: "company", scopeId: company.id, stateKey: STATE_KEY },
          state,
        );

        // Deliver suggestions based on configured mode
        const threshold = (config?.failureThresholdPercent as number) ?? 30;
        const deliveryMode = (config?.deliveryMode as string) ?? "comments";

        for (const perf of Object.values(performances)) {
          if (perf.successRate >= (100 - threshold) || perf.suggestions.length === 0) continue;

          // Always log to activity
          await ctx.activity.log({
            companyId: company.id,
            action: "plugin.self-improve.suggestions",
            entityType: "agent",
            entityId: perf.agentId,
            details: {
              agentName: perf.agentName,
              successRate: perf.successRate,
              deliveryMode,
              suggestions: perf.suggestions,
            },
          });

          // Skip delivery if disabled
          if (deliveryMode === "disabled") continue;

          // Check if we already delivered these suggestions (avoid spam)
          const deliveryKey = `delivered-${perf.agentId}`;
          const lastDelivery = await ctx.state.get({
            scopeKind: "agent",
            scopeId: perf.agentId,
            stateKey: deliveryKey,
          }) as { hash: string; at: string } | null;

          const suggestionsHash = perf.suggestions.join("|");
          if (lastDelivery?.hash === suggestionsHash) continue;

          try {
            if (deliveryMode === "comments") {
              await deliverViaComments(ctx, company.id, perf);
            } else if (deliveryMode === "instructions") {
              await deliverViaInstructions(ctx, company.id, perf);
            }

            // Record delivery to avoid repeats
            await ctx.state.set(
              { scopeKind: "agent", scopeId: perf.agentId, stateKey: deliveryKey },
              { hash: suggestionsHash, at: new Date().toISOString() },
            );

            ctx.logger.info(`Delivered ${perf.suggestions.length} suggestions to ${perf.agentName} via ${deliveryMode}`);
          } catch (err) {
            ctx.logger.error(`Failed to deliver suggestions to ${perf.agentName}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }

      ctx.logger.info("Performance analysis complete");
    });

    // ── Data handlers for UI ───────────────────────────────────

    ctx.data.register(DATA_KEYS.OVERVIEW, async (params) => {
      const companyId = params?.companyId;
      if (!companyId) return { agents: [], lastAnalysisAt: null };

      const state: PluginState = (await ctx.state.get({
        scopeKind: "company",
        scopeId: companyId as string,
        stateKey: STATE_KEY,
      })) ?? emptyState();

      const agents = Object.values(state.performances)
        .sort((a, b) => a.successRate - b.successRate);

      const totalRuns = state.runs.length;
      const totalCost = state.runs.reduce((sum, r) => sum + r.costUsd, 0);
      const overallSuccessRate = totalRuns > 0
        ? (state.runs.filter((r) => r.status === "succeeded").length / totalRuns) * 100
        : 0;

      return {
        agents,
        totalRuns,
        totalCost,
        overallSuccessRate,
        lastAnalysisAt: state.lastAnalysisAt,
        agentsWithSuggestions: agents.filter((a) => a.suggestions.length > 0).length,
      };
    });

    ctx.data.register(DATA_KEYS.AGENT_DETAIL, async (params) => {
      const companyId = params?.companyId;
      const agentId = params?.agentId;
      if (!companyId || !agentId) return null;

      const state: PluginState = (await ctx.state.get({
        scopeKind: "company",
        scopeId: companyId as string,
        stateKey: STATE_KEY,
      })) ?? emptyState();

      const perf = state.performances[agentId as string] ?? null;
      const recentRuns = state.runs
        .filter((r) => r.agentId === agentId)
        .slice(-20)
        .reverse();

      return { performance: perf, recentRuns };
    });

    ctx.data.register(DATA_KEYS.CONFIG, async () => {
      return config;
    });

    // ── Actions ────────────────────────────────────────────────

    ctx.actions.register(ACTION_KEYS.ANALYZE_NOW, async (params) => {
      const companyId = params?.companyId;
      if (!companyId) return { error: "No company ID" };

      const minRuns = (config?.minRunsForAnalysis as number) ?? 5;
      const state: PluginState = (await ctx.state.get({
        scopeKind: "company",
        scopeId: companyId as string,
        stateKey: STATE_KEY,
      })) ?? emptyState();

      const performances = analyzePerformance(state, minRuns);
      state.performances = performances;
      state.lastAnalysisAt = new Date().toISOString();

      await ctx.state.set(
        { scopeKind: "company", scopeId: companyId as string, stateKey: STATE_KEY },
        state,
      );

      return { analyzed: Object.keys(performances).length, lastAnalysisAt: state.lastAnalysisAt };
    });

    ctx.actions.register(ACTION_KEYS.CLEAR_DATA, async (params) => {
      const companyId = params?.companyId;
      if (!companyId) return { error: "No company ID" };

      await ctx.state.set(
        { scopeKind: "company", scopeId: companyId as string, stateKey: STATE_KEY },
        emptyState(),
      );

      return { cleared: true };
    });
  },
});

export default plugin;
startWorkerRpcHost({ plugin });
