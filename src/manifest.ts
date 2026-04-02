const manifest = {
  id: "animus.self-improve",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Agent Self-Improvement",
  description:
    "Tracks agent run outcomes, detects failure patterns, and generates improvement suggestions that refine agent behavior over time.",
  author: "Animus Systems",
  categories: ["automation", "analytics"],
  capabilities: [
    "events.subscribe",
    "jobs.schedule",
    "plugin.state.read",
    "plugin.state.write",
    "companies.read",
    "agents.read",
    "issues.read",
    "issue.comments.read",
    "issues.update",
    "issue.comments.create",
    "activity.log.write",
    "http.outbound",
    "ui.dashboardWidget.register",
    "ui.detailTab.register",
    "instance.settings.register",
    "ui.action.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        title: "Enable self-improvement tracking",
        description: "Track agent run outcomes and generate improvement suggestions",
        default: true,
      },
      analysisIntervalMinutes: {
        type: "number",
        title: "Analysis interval (minutes)",
        description: "How often to analyze agent performance patterns",
        default: 60,
        minimum: 10,
        maximum: 1440,
      },
      minRunsForAnalysis: {
        type: "number",
        title: "Minimum runs for analysis",
        description: "Minimum number of runs before generating suggestions",
        default: 5,
        minimum: 3,
        maximum: 50,
      },
      failureThresholdPercent: {
        type: "number",
        title: "Failure threshold (%)",
        description: "Failure rate above which suggestions are generated",
        default: 30,
        minimum: 10,
        maximum: 90,
      },
      deliveryMode: {
        type: "string",
        title: "Suggestion delivery mode",
        description: "How improvement suggestions are delivered to agents. 'comments' posts them on active issues so agents see them. 'instructions' appends them to the agent's AGENTS.md for permanent behavior change.",
        default: "comments",
        enum: ["comments", "instructions", "disabled"],
      },
    },
  },
  jobs: [
    {
      jobKey: "analyze-performance",
      displayName: "Analyze Agent Performance",
    },
  ],
  ui: {
    slots: [
      {
        type: "dashboardWidget",
        id: "self-improve-overview",
        displayName: "Agent Performance",
        exportName: "PerformanceDashboardWidget",
      },
      {
        type: "detailTab",
        id: "self-improve-agent-tab",
        displayName: "Performance",
        exportName: "AgentPerformanceTab",
        entityTypes: ["agent"],
      },
      {
        type: "settingsPage",
        id: "self-improve-settings",
        displayName: "Self-Improvement Settings",
        exportName: "SelfImproveSettingsPage",
      },
    ],
  },
};

export default manifest;
