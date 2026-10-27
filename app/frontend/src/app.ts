import type { AskResult, State } from "./types";

/** What every view gets: the latest backend state and a few app-wide actions. */
export interface App {
  state: State;
  refresh(): Promise<void>;
  go(route: string): void;
  /** Register cleanup (timers, graph instances) for when the user leaves the view. */
  onLeave(fn: () => void): void;
  /** The last Ask result, kept while moving between pages. */
  lastAsk?: AskResult;
}

export type View = (app: App) => HTMLElement;

export const llmReady = (s: State) => Boolean(s.settings.llm.provider && s.settings.llm.model);

export const airflowReady = (s: State) => {
  const a = s.settings.airflow;
  return Boolean(a.url && (a.has_token || (a.username && a.has_password)));
};

export const datahubReady = (s: State) => Boolean(s.settings.datahub.url && s.settings.datahub.has_token);
