import "./styles/base.css";
import "./styles/components.css";
import "./styles/views.css";

import { api } from "./api";
import { type App, type View, airflowReady, datahubReady, llmReady } from "./app";
import { h, svg } from "./dom";
import { icons } from "./icons";
import { logo, wordmark } from "./logos";
import type { State } from "./types";
import { askView } from "./views/ask";
import { connectView } from "./views/connect";
import { graphView } from "./views/graph";
import { overviewView } from "./views/overview";
import { syncView } from "./views/sync";

interface Route {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  icon: string;
  view: View;
  done?: (s: State) => boolean;
}

const ROUTES: Route[] = [
  { id: "overview", label: "Overview", icon: icons.home, view: overviewView,
    title: "Give cognee the context of your data platform",
    subtitle: "Two connectors, three memories, one question." },
  { id: "connect", label: "Connect", icon: icons.plug, view: connectView,
    title: "Connect", subtitle: "Bring your own AI key, then point the lab at Airflow and DataHub.",
    done: (s) => llmReady(s) && airflowReady(s) && datahubReady(s) },
  { id: "sync", label: "Sync", icon: icons.sync, view: syncView,
    title: "Sync", subtitle: "Run each connector into cognee memory.",
    done: (s) => s.jobs.airflow.state === "done" && s.jobs.datahub.state === "done" },
  { id: "ask", label: "Ask", icon: icons.ask, view: askView,
    title: "Ask", subtitle: "One question, three memories. See what each connector adds." },
  { id: "graph", label: "Graph", icon: icons.graph, view: graphView,
    title: "Knowledge graph", subtitle: "What cognee built from the connector documents." },
];

const root = document.getElementById("app")!;
let leaving: (() => void)[] = [];

const app: App = {
  state: undefined as unknown as State,
  async refresh() {
    app.state = await api.state();
    renderNav();
  },
  go(route) {
    location.hash = `#/${route}`;
  },
  onLeave(fn) {
    leaving.push(fn);
  },
};

const nav = h("nav", { class: "nav" });
const modelChip = h("div", { class: "model-chip" });
const header = h("header", { class: "page-header" });
const content = h("main", { class: "page" });

function current(): Route {
  const id = location.hash.replace(/^#\/?/, "");
  return ROUTES.find((r) => r.id === id) ?? ROUTES[0];
}

function renderNav(): void {
  const active = current();
  nav.replaceChildren(...ROUTES.map((route, i) => h("a", {
    href: `#/${route.id}`,
    class: `nav-item${route === active ? " active" : ""}`,
  }, svg(route.icon), h("span", {}, route.label),
  i > 0 ? h("span", { class: `nav-step${route.done?.(app.state) ? " done" : ""}` },
    route.done?.(app.state) ? svg(icons.check) : String(i)) : null)));

  const llm = app.state.settings.llm;
  modelChip.replaceChildren(llmReady(app.state)
    ? h("a", { href: "#/connect", class: "model-chip-inner" }, logo(llm.provider, 22),
      h("span", {}, h("small", {}, "Model"), h("b", {}, llm.model)))
    : h("a", { href: "#/connect", class: "model-chip-inner empty" }, svg(icons.key),
      h("span", {}, h("small", {}, "No model yet"), h("b", {}, "Add your AI key"))));
}

function render(): void {
  leaving.forEach((fn) => fn());
  leaving = [];
  const route = current();
  renderNav();
  header.replaceChildren(h("h1", {}, route.title), h("p", {}, route.subtitle));
  content.replaceChildren(route.view(app));
  content.scrollTo?.(0, 0);
}

async function start(): Promise<void> {
  root.replaceChildren(
    h("aside", { class: "sidebar" },
      h("a", { href: "#/overview", class: "brand" }, wordmark(30),
        h("small", {}, "Data Engineering Lab")),
      nav,
      h("div", { class: "sidebar-foot" }, modelChip,
        h("div", { class: "powered" }, "Connectors", logo("airflow", 18), logo("datahub", 18)))),
    h("div", { class: "main" }, header, content),
  );
  try {
    app.state = await api.state();
  } catch {
    content.replaceChildren(h("div", { class: "card empty-state" },
      h("h2", {}, "The lab backend is not reachable"),
      h("p", {}, "Start it with ", h("code", {}, "./run-local.sh"), " in app/backend, then reload.")));
    return;
  }
  window.addEventListener("hashchange", render);
  render();
}

start();
