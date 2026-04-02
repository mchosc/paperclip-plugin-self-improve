import { useState } from "react";
import { usePluginData, usePluginAction, useHostContext } from "@paperclipai/plugin-sdk/ui";

interface AgentPerf {
  agentId: string;
  agentName: string;
  totalRuns: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  successRate: number;
  totalCostUsd: number;
  suggestions: string[];
}

interface OverviewData {
  agents: AgentPerf[];
  totalRuns: number;
  totalCost: number;
  overallSuccessRate: number;
  lastAnalysisAt: string | null;
  agentsWithSuggestions: number;
}

export function PerformanceDashboardWidget() {
  const context = useHostContext();
  const { data, isLoading } = usePluginData<OverviewData>("self-improve-overview", { companyId: context.companyId });
  const analyzeAction = usePluginAction("analyze-now");
  const [analyzing, setAnalyzing] = useState(false);

  if (isLoading) return <div style={{ padding: 16, opacity: 0.5 }}>Loading performance data...</div>;
  if (!data || data.totalRuns === 0) {
    return (
      <div style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>Agent Performance</h3>
        <p style={{ color: "#888", fontSize: 13 }}>No run data yet. Performance tracking will begin once agents complete runs.</p>
      </div>
    );
  }

  const rateColor = data.overallSuccessRate >= 80 ? "#22c55e" : data.overallSuccessRate >= 60 ? "#eab308" : "#ef4444";

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Agent Performance</h3>
        <button
          onClick={async () => { setAnalyzing(true); try { await analyzeAction({ companyId: context.companyId }); } finally { setAnalyzing(false); } }}
          disabled={analyzing}
          style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid #333", background: "transparent", color: "#ccc", cursor: "pointer" }}
        >
          {analyzing ? "Analyzing..." : "Analyze Now"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: rateColor }}>{data.overallSuccessRate.toFixed(0)}%</div>
          <div style={{ fontSize: 11, color: "#888" }}>Success Rate</div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{data.totalRuns}</div>
          <div style={{ fontSize: 11, color: "#888" }}>Total Runs</div>
        </div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>${data.totalCost.toFixed(2)}</div>
          <div style={{ fontSize: 11, color: "#888" }}>Total Cost</div>
        </div>
        {data.agentsWithSuggestions > 0 && (
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#eab308" }}>{data.agentsWithSuggestions}</div>
            <div style={{ fontSize: 11, color: "#888" }}>Need Attention</div>
          </div>
        )}
      </div>

      {data.agents.length > 0 && (
        <div style={{ fontSize: 12 }}>
          <div style={{ display: "flex", padding: "4px 0", borderBottom: "1px solid #333", color: "#888", fontWeight: 500 }}>
            <div style={{ flex: 2 }}>Agent</div>
            <div style={{ flex: 1, textAlign: "right" }}>Runs</div>
            <div style={{ flex: 1, textAlign: "right" }}>Rate</div>
            <div style={{ flex: 1, textAlign: "right" }}>Cost</div>
          </div>
          {data.agents.slice(0, 10).map((a) => {
            const color = a.successRate >= 80 ? "#22c55e" : a.successRate >= 60 ? "#eab308" : "#ef4444";
            return (
              <div key={a.agentId} style={{ display: "flex", padding: "4px 0", borderBottom: "1px solid #222" }}>
                <div style={{ flex: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  {a.suggestions.length > 0 && <span style={{ color: "#eab308" }}>!</span>}
                  {a.agentName}
                </div>
                <div style={{ flex: 1, textAlign: "right" }}>{a.totalRuns}</div>
                <div style={{ flex: 1, textAlign: "right", color }}>{a.successRate.toFixed(0)}%</div>
                <div style={{ flex: 1, textAlign: "right" }}>${a.totalCostUsd.toFixed(2)}</div>
              </div>
            );
          })}
        </div>
      )}

      {data.lastAnalysisAt && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#666" }}>
          Last analyzed: {new Date(data.lastAnalysisAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
