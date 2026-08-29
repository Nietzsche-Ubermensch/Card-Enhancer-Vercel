/** Vercel Connect Linear — app-subject token. No env dump, no VITE_*. */

export const LINEAR_CONNECT_ID = "linear/hermes-gitlab-integration" as const;
export const LINEAR_CONNECT_TRIGGER_PATH = "/triggers/linear" as const;
export const LINEAR_CONNECT_TRIGGER_URL =
  "https://connect.vercel.com/trigger/scl_z2Mb2pS1dZcGczIPZzokiA" as const;

export async function linearConnectToken(): Promise<string | null> {
  try {
    const { getToken } = await import("@vercel/connect");
    const token = await getToken(LINEAR_CONNECT_ID, { subject: { type: "app" } });
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}
