import type { AskResult, Doc, Graph, Job, MemoryId, SourceId, State, TestResult } from "./types";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : `HTTP ${response.status}`);
  }
  return data as T;
}

export const api = {
  state: () => call<State>("GET", "/state"),
  saveSettings: (section: string, values: Record<string, string>) =>
    call("POST", `/settings/${section}`, values),
  clearSettings: (section: string) => call("DELETE", `/settings/${section}`),
  models: (provider: string, api_key: string, endpoint: string) =>
    call<{ models: string[] }>("POST", "/llm/models", { provider, api_key, endpoint }),
  test: (source: SourceId) => call<TestResult>("POST", `/test/${source}`),
  sync: (source: SourceId) => call<Job>("POST", `/sync/${source}`),
  documents: () => call<Record<MemoryId, Doc[]>>("GET", "/documents"),
  ask: (question: string) => call<AskResult>("POST", "/ask", { question }),
  graph: (memory: MemoryId) => call<Graph>("GET", `/graph/${memory}`),
};
