import { usePluginData, useHostContext } from "@paperclipai/plugin-sdk/ui";

interface RunRecord {
  runId: string;
  status: string;
  startedAt: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  error: string | null;
  summary: string | null;
}

interface AgentPerf {
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

interface AgentDetailData {
  performance: AgentPerf | null;
  recentRuns: RunRecord[];
}

export function AgentPerformanceTab({ entityId }: { entityId?: string }) {
  const context = useHostContext();
  const { data, isLoading } = usePluginData<AgentDetailData>("self-improve-agent-detail", { agentId: entityId, companyId: context.companyId });

  if (isLoading) return <div style={{ padding: 16, opacity: 0.5 }}>Loading...</div>;
  if (!data?.performance) {
    return (
      <div style={{ padding: 16, color: "#888", fontSize: 13 }}>
        No performance data yet. Data will appear after the agent completes several runs and the analysis job executes.
      </div>
    );
  }

  const perf = data.performance;
  const rateColor = perf.successRate >= 80 ? "#22c55e" : perf.successRate >= 60 ? "#eab308" : "#ef4444";

  return (
    <div style={{ padding: 16 }}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
        <Stat label="Success Rate" value={`${perf.successRate.toFixed(0)}%`} color={rateColor} />
        <Stat label="Total Runs" value={String(perf.totalRuns)} />
        <Stat label="Avg Duration" value={`${(perf.avgDurationMs / 1000).toFixed(0)}s`} />
        <Stat label="Avg Tokens" value={`${(perf.avgTokensPerRun / 1000).toFixed(0)}K`} />
        <Stat label="Total Cost" value={`$${perf.totalCostUsd.toFixed(2)}`} />
      </div>

      {/* Suggestions */}
      {perf.suggestions.length > 0 && (
        <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, border: "1px solid #854d0e", background: "#1c1408" }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#eab308" }}>
            Improvement Suggestions ({perf.suggestions.length})
          </h4>
          <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 12, lineHeight: 1.6 }}>
            {perf.suggestions.map((s, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Error patterns */}
      {perf.recentErrors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Error Patterns</h4>
          <div style={{ fontSize: 12 }}>
            {perf.recentErrors.map((e, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #222" }}>
                <span style={{ fontFamily: "monospace" }}>{e.error}</span>
                <span style={{ color: "#ef4444" }}>{e.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent runs */}
      {data.recentRuns.length > 0 && (
        <div>
          <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Recent Runs</h4>
          <div style={{ fontSize: 12 }}>
            <div style={{ display: "flex", padding: "4px 0", borderBottom: "1px solid #333", color: "#888", fontWeight: 500 }}>
              <div style={{ flex: 1 }}>Time</div>
              <div style={{ width: 70, textAlign: "center" }}>Status</div>
              <div style={{ width: 60, textAlign: "right" }}>Duration</div>
              <div style={{ width: 70, textAlign: "right" }}>Tokens</div>
              <div style={{ width: 60, textAlign: "right" }}>Cost</div>
            </div>
            {data.recentRuns.map((r) => {
              const statusColor = r.status === "succeeded" ? "#22c55e" : r.status === "failed" ? "#ef4444" : "#eab308";
              return (
                <div key={r.runId} style={{ display: "flex", padding: "4px 0", borderBottom: "1px solid #222" }}>
                  <div style={{ flex: 1, color: "#888" }}>{new Date(r.startedAt).toLocaleString()}</div>
                  <div style={{ width: 70, textAlign: "center", color: statusColor }}>{r.status}</div>
                  <div style={{ width: 60, textAlign: "right" }}>{(r.durationMs / 1000).toFixed(0)}s</div>
                  <div style={{ width: 70, textAlign: "right" }}>{((r.inputTokens + r.outputTokens) / 1000).toFixed(0)}K</div>
                  <div style={{ width: 60, textAlign: "right" }}>${r.costUsd.toFixed(3)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: "#666" }}>
        Last analyzed: {new Date(perf.lastAnalyzedAt).toLocaleString()}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? "inherit" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#888" }}>{label}</div>
    </div>
  );
}
