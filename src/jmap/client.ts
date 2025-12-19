/**
 * Minimal JMAP client for making method calls to the JMAP API.
 */

export type JmapMethodCall = [methodName: string, args: Record<string, unknown>, callId: string];
export type JmapMethodResponse = [methodName: string, response: Record<string, unknown>, callId: string];

export interface JmapRequest {
  using: string[];
  methodCalls: JmapMethodCall[];
}

export interface JmapResponse {
  methodResponses: JmapMethodResponse[];
  sessionState?: string;
}

let requestCounter = 0;

export function generateCallId(prefix = "c"): string {
  return `${prefix}${++requestCounter}`;
}

export async function jmapRequest(
  apiUrl: string,
  authHeader: string,
  using: string[],
  methodCalls: JmapMethodCall[]
): Promise<JmapResponse> {
  const request: JmapRequest = { using, methodCalls };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`JMAP request failed: ${response.status} ${response.statusText} - ${text}`);
  }

  const data = (await response.json()) as JmapResponse;
  return data;
}

export function findResponse<T = Record<string, unknown>>(
  responses: JmapMethodResponse[],
  callId: string
): T | null {
  const match = responses.find(([, , id]) => id === callId);
  if (!match) return null;
  return match[1] as T;
}

export function isErrorResponse(response: JmapMethodResponse): boolean {
  return response[0] === "error";
}
