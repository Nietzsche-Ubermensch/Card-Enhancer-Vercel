/** Live Linear board for Juggintillwedie — identifiers and URLs from Linear MCP. */
export const LINEAR_BOARD = {
  workspace: "bateyjules",
  team: "Juggintillwedie",
  teamKey: "JUG",
  teamId: "bc805575-ad97-4c4a-b316-e42c2ad05ed4",
  project: "Execute implementation contract for cardcrop-ai-suite",
  projectId: "a6160086-387d-46cd-9611-08686d638a83",
  projectUrl: "https://linear.app/bateyjules/project/execute-implementation-contract-for-cardcrop-ai-suite-5349adac1e4f",
  teamUrl: "https://linear.app/bateyjules/team/JUG/all",
  webhookPath: "/api/webhooks/linear",
  connectPath: "/triggers/linear",
  connectId: "linear/hermes-gitlab-integration",
  webhookDocs: "https://linear.app/developers/webhooks",
} as const;

export type LinearIssue = {
  id: string;
  title: string;
  status: string;
  statusType: "backlog" | "unstarted" | "started" | "completed" | "canceled";
  priority: string;
  url: string;
  assignee?: string;
};

export const LINEAR_ISSUES: LinearIssue[] = [
  {
    id: "JUG-18",
    title: "Reality check · public deploy is Grok preview only",
    status: "In Progress",
    statusType: "started",
    priority: "Urgent",
    url: "https://linear.app/bateyjules/issue/JUG-18/reality-check-public-deploy-is-grok-preview-only",
    assignee: "Matthew",
  },
  {
    id: "JUG-17",
    title: "Batch export · JSON/CSV manifests, inspect grade, EXIF + landscape print",
    status: "Done",
    statusType: "completed",
    priority: "High",
    url: "https://linear.app/bateyjules/issue/JUG-17/batch-export-jsoncsv-manifests-inspect-grade-exif-landscape-print",
    assignee: "Matthew",
  },
  {
    id: "JUG-16",
    title: "Hub upscaler rack · ESRGAN / Real-ESRGAN / SwinIR / LFESR",
    status: "Done",
    statusType: "completed",
    priority: "High",
    url: "https://linear.app/bateyjules/issue/JUG-16/hub-upscaler-rack-esrgan-real-esrgan-swinir-lfesr",
    assignee: "Matthew",
  },
  {
    id: "JUG-15",
    title: "Linear API webhooks · HMAC inbox + Jobs deliveries",
    status: "Done",
    statusType: "completed",
    priority: "High",
    url: "https://linear.app/bateyjules/issue/JUG-15/linear-api-webhooks-hmac-inbox-jobs-deliveries",
    assignee: "Matthew",
  },
  {
    id: "JUG-1",
    title: "Execute implementation contract for cardcrop-ai-suite",
    status: "Done",
    statusType: "completed",
    priority: "Urgent",
    url: "https://linear.app/bateyjules/issue/JUG-1/execute-implementation-contract-for-cardcrop-ai-suite-converted-to",
    assignee: "Matthew",
  },
  {
    id: "JUG-2",
    title: "Test photos",
    status: "Done",
    statusType: "completed",
    priority: "Urgent",
    url: "https://linear.app/bateyjules/issue/JUG-2/test-photos",
    assignee: "Matthew",
  },
  {
    id: "JUG-3",
    title: "Add AI endpoint rate limiting",
    status: "Done",
    statusType: "completed",
    priority: "Urgent",
    url: "https://linear.app/bateyjules/issue/JUG-3/add-ai-endpoint-rate-limiting",
    assignee: "Matthew",
  },
  {
    id: "JUG-4",
    title: "Add timeouts to AI provider requests",
    status: "Done",
    statusType: "completed",
    priority: "Urgent",
    url: "https://linear.app/bateyjules/issue/JUG-4/add-timeouts-to-ai-provider-requests",
    assignee: "Matthew",
  },
  {
    id: "JUG-5",
    title: "Move AI API keys out of localStorage",
    status: "Done",
    statusType: "completed",
    priority: "Urgent",
    url: "https://linear.app/bateyjules/issue/JUG-5/move-ai-api-keys-out-of-localstorage",
    assignee: "Matthew",
  },
  {
    id: "JUG-6",
    title: "Validate AI endpoint input schemas",
    status: "Done",
    statusType: "completed",
    priority: "Urgent",
    url: "https://linear.app/bateyjules/issue/JUG-6/validate-ai-endpoint-input-schemas",
    assignee: "Matthew",
  },
  {
    id: "JUG-7",
    title: "Split server routes and AI providers",
    status: "Done",
    statusType: "completed",
    priority: "High",
    url: "https://linear.app/bateyjules/issue/JUG-7/split-server-routes-and-ai-providers",
    assignee: "Matthew",
  },
  {
    id: "JUG-8",
    title: "Consolidate AIProvider type definitions",
    status: "Done",
    statusType: "completed",
    priority: "High",
    url: "https://linear.app/bateyjules/issue/JUG-8/consolidate-aiprovider-type-definitions",
    assignee: "Matthew",
  },
  {
    id: "JUG-9",
    title: "Remove unused Puppeteer dependency",
    status: "Done",
    statusType: "completed",
    priority: "Medium",
    url: "https://linear.app/bateyjules/issue/JUG-9/remove-unused-puppeteer-dependency",
  },
  {
    id: "JUG-10",
    title: "Add route-level AI error handling",
    status: "Done",
    statusType: "completed",
    priority: "High",
    url: "https://linear.app/bateyjules/issue/JUG-10/add-route-level-ai-error-handling",
  },
  {
    id: "JUG-11",
    title: "MCP integration · 9 providers",
    status: "Done",
    statusType: "completed",
    priority: "None",
    url: "https://linear.app/bateyjules/issue/JUG-11/add-mcp-integration-action-with-9-provider-implementationsi-am-the",
    assignee: "Matthew",
  },
  {
    id: "JUG-12",
    title: "AI model connector audit and pipeline state",
    status: "Done",
    statusType: "completed",
    priority: "Urgent",
    url: "https://linear.app/bateyjules/issue/JUG-12/ai-model-connector-audit-and-pipeline-state",
    assignee: "Matthew",
  },
  {
    id: "JUG-13",
    title: "Linear jobs board in the batch enhancer",
    status: "Done",
    statusType: "completed",
    priority: "High",
    url: "https://linear.app/bateyjules/issue/JUG-13/linear-jobs-board-in-the-batch-enhancer",
    assignee: "Matthew",
  },
  {
    id: "JUG-14",
    title: "Wire GitMCP + Hugging Face HTTP endpoints, Zod schemas, and tests",
    status: "Done",
    statusType: "completed",
    priority: "High",
    url: "https://linear.app/bateyjules/issue/JUG-14/wire-gitmcp-hugging-face-http-endpoints-zod-schemas-and-tests",
    assignee: "Matthew",
  },
];

export function linearCounts(issues: LinearIssue[] = LINEAR_ISSUES) {
  return {
    open: issues.filter((i) => i.statusType !== "completed" && i.statusType !== "canceled").length,
    done: issues.filter((i) => i.statusType === "completed").length,
    started: issues.filter((i) => i.statusType === "started").length,
  };
}
