// Shapes returned by the lab backend (app/backend/lab/server.py).

export type SourceId = "airflow" | "datahub";
export type MemoryId = "airflow" | "datahub" | "combined";

export interface LlmSettings {
  provider: string;
  model: string;
  endpoint: string;
  has_api_key: boolean;
}

export interface AirflowSettings {
  url: string;
  username: string;
  dag_id_pattern: string;
  tags: string;
  has_password: boolean;
  has_token: boolean;
}

export interface DatahubSettings {
  url: string;
  frontend_url: string;
  platforms: string;
  domains: string;
  has_token: boolean;
}

export interface Settings {
  llm: LlmSettings;
  airflow: AirflowSettings;
  datahub: DatahubSettings;
}

export interface Provider {
  label: string;
  key: boolean;
  endpoint?: string;
}

export interface Job {
  source: SourceId;
  state: "idle" | "running" | "done" | "failed";
  started_at: number | null;
  finished_at: number | null;
  steps: string[];
  error: string | null;
}

export interface Memory {
  id: MemoryId;
  dataset: string;
  label: string;
  sources: SourceId[];
}

export interface Question {
  id: string;
  needs: "both" | SourceId;
  text: string;
  expected: string[];
}

export interface State {
  settings: Settings;
  providers: Record<string, Provider>;
  jobs: Record<SourceId, Job>;
  memories: Memory[];
  questions: Question[];
}

export interface Doc {
  title: string;
  source: SourceId | null;
  external_id: string | null;
  url: string | null;
  updated_at: string;
}

export interface Evidence {
  documents: Doc[];
  graph: { nodes: number; edges: number; relations: string[] };
}

export interface Answer {
  memory: MemoryId;
  label: string;
  dataset: string;
  answer: string;
  context: string;
  evidence: Evidence;
  error: string | null;
  elapsed_ms: number;
}

export interface AskResult {
  question: string;
  results: Answer[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TestResult {
  ok: boolean;
  detail: string;
}
