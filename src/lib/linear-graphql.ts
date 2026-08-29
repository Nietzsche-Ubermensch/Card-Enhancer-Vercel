/** Linear GraphQL mutations for webhooks. Admin scope. Do not point at localhost. */

export const LINEAR_GQL = "https://api.linear.app/graphql";
export const LINEAR_TEAM_ID = "bc805575-ad97-4c4a-b316-e42c2ad05ed4";
export const LINEAR_CONNECT_TRIGGER =
  "https://connect.vercel.com/trigger/scl_z2Mb2pS1dZcGczIPZzokiA";

export const WEBHOOK_LIST_QUERY = `query {
  webhooks {
    nodes { id url enabled label resourceTypes team { id key } }
  }
}`;

export const WEBHOOK_CREATE_MUTATION = `mutation WebhookCreate($url: String!, $teamId: String!, $resourceTypes: [String!]!, $label: String) {
  webhookCreate(input: { url: $url, teamId: $teamId, resourceTypes: $resourceTypes, label: $label }) {
    success
    webhook { id enabled url label }
  }
}`;

export const WEBHOOK_UPDATE_MUTATION = `mutation WebhookUpdate($id: String!, $enabled: Boolean, $url: String) {
  webhookUpdate(id: $id, input: { enabled: $enabled, url: $url }) {
    success
    webhook { id enabled url }
  }
}`;

export const WEBHOOK_DELETE_MUTATION = `mutation WebhookDelete($id: String!) {
  webhookDelete(id: $id) { success }
}`;

export const ISSUE_CREATE_MUTATION = `mutation IssueCreate($title: String!, $teamId: String!, $description: String) {
  issueCreate(input: { title: $title, teamId: $teamId, description: $description }) {
    success
    issue { id identifier url }
  }
}`;

export const COMMENT_CREATE_MUTATION = `mutation CommentCreate($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) {
    success
    comment { id }
  }
}`;

/** localhost is rejected by Linear (HTTPS, public). Use Connect trigger. */
export const WEBHOOK_CREATE_VARS = {
  url: LINEAR_CONNECT_TRIGGER,
  teamId: LINEAR_TEAM_ID,
  resourceTypes: ["Issue", "Comment", "Project"],
  label: "Card Enhancer Connect",
};

export function linearGraphqlHeaders(apiKey: string) {
  return {
    Authorization: apiKey,
    "Content-Type": "application/json",
  };
}
