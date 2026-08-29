import { createServerFn } from "@tanstack/react-start";
import { LINEAR_BOARD, LINEAR_ISSUES, linearCounts, type LinearIssue } from "./linear-board";
import { firstEnv } from "./remote-auth";

export type LinearJobsPayload = {
  source: "live" | "snapshot";
  board: typeof LINEAR_BOARD;
  issues: LinearIssue[];
  counts: ReturnType<typeof linearCounts>;
};

function mapType(type: string): LinearIssue["statusType"] {
  if (type === "completed" || type === "canceled" || type === "started" || type === "unstarted" || type === "backlog") {
    return type;
  }
  return "backlog";
}

export async function loadLinearJobs(): Promise<LinearJobsPayload> {
  const key = firstEnv("LINEAR_API_KEY", "LINEAR_API_TOKEN");
  if (!key) {
    return { source: "snapshot", board: LINEAR_BOARD, issues: LINEAR_ISSUES, counts: linearCounts() };
  }

  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `query JugIssues {
        issues(filter: { team: { key: { eq: "JUG" } } }, first: 50) {
          nodes {
            identifier
            title
            url
            priorityLabel
            state { name type }
            assignee { name }
          }
        }
      }`,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    return { source: "snapshot", board: LINEAR_BOARD, issues: LINEAR_ISSUES, counts: linearCounts() };
  }

  const body = (await res.json()) as {
    data?: {
      issues?: {
        nodes?: {
          identifier: string;
          title: string;
          url: string;
          priorityLabel?: string;
          state?: { name: string; type: string };
          assignee?: { name: string } | null;
        }[];
      };
    };
  };

  const nodes = body.data?.issues?.nodes ?? [];
  if (nodes.length === 0) {
    return { source: "snapshot", board: LINEAR_BOARD, issues: LINEAR_ISSUES, counts: linearCounts() };
  }

  const issues: LinearIssue[] = nodes.map((n) => ({
    id: n.identifier,
    title: n.title,
    status: n.state?.name ?? "Unknown",
    statusType: mapType(n.state?.type ?? "backlog"),
    priority: n.priorityLabel ?? "None",
    url: n.url,
    assignee: n.assignee?.name,
  }));

  return { source: "live", board: LINEAR_BOARD, issues, counts: linearCounts(issues) };
}

export const getLinearJobs = createServerFn({ method: "GET" }).handler(async () => loadLinearJobs());
