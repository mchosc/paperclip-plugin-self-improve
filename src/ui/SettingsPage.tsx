import { useState } from "react";
import { usePluginData, usePluginAction, useHostContext } from "@paperclipai/plugin-sdk/ui";

interface OverviewData {
  totalRuns: number;
  totalCost: number;
  overallSuccessRate: number;
  lastAnalysisAt: string | null;
  agentsWithSuggestions: number;
}

export function SelfImproveSettingsPage() {
  const context = useHostContext();
  const { data } = usePluginData<OverviewData>("self-improve-overview", { companyId: context.companyId });
  const analyzeAction = usePluginAction("analyze-now");
  const clearAction = usePluginAction("clear-data");
  const [analyzing, setAnalyzing] = useState(false);
  const [clearing, setClearing] = useState(false);

  return (
    <div style={{ padding: 16, maxWidth: 600 }}>
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>Self-Improvement Plugin</h3>

      {data && (
        <div style={{ marginBottom: 24, padding: 12, borderRadius: 8, border: "1px solid #333" }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Current Stats</h4>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <div>Total runs tracked: <strong>{data.totalRuns}</strong></div>
            <div>Overall success rate: <strong>{data.overallSuccessRate.toFixed(0)}%</strong></div>
            <div>Total cost: <strong>${data.totalCost.toFixed(2)}</strong></div>
            <div>Agents needing attention: <strong>{data.agentsWithSuggestions}</strong></div>
            <div>Last analysis: <strong>{data.lastAnalysisAt ? new Date(data.lastAnalysisAt).toLocaleString() : "Never"}</strong></div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={async () => { setAnalyzing(true); try { await analyzeAction({ companyId: context.companyId }); } finally { setAnalyzing(false); } }}
          disabled={analyzing}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "1px solid #333",
            background: "#1a1a2e", color: "#ccc", cursor: "pointer", fontSize: 13,
          }}
        >
          {analyzing ? "Analyzing..." : "Run Analysis Now"}
        </button>
        <button
          onClick={async () => {
            if (confirm("Clear all performance data? This cannot be undone.")) {
              setClearing(true);
              try { await clearAction({ companyId: context.companyId }); } finally { setClearing(false); }
            }
          }}
          disabled={clearing}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "1px solid #442222",
            background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: 13,
          }}
        >
          {clearing ? "Clearing..." : "Clear All Data"}
        </button>
      </div>
    </div>
  );
}
