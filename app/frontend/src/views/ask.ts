import { api } from "../api";
import { type App, llmReady } from "../app";
import { busy, h, svg } from "../dom";
import { icons } from "../icons";
import { brandName, logo } from "../logos";
import type { Answer, AskResult, Doc, Evidence, Question } from "../types";

const NEEDS: Record<Question["needs"], string[]> = {
  both: ["airflow", "datahub"], airflow: ["airflow"], datahub: ["datahub"],
};

// Models write non-breaking spaces and hyphens (U+00A0, U+202F, U+2011); compare plain text.
const plain = (text: string) =>
  text.toLowerCase().replace(/[   ]/g, " ").replace(/[‐-―]/g, "-")
    .replace(/[`*_]/g, "");

/** Which expected facts appear in the answer. A visible check, not a score. */
function factChecks(answer: string, expected: string[]): HTMLElement {
  const text = plain(answer);
  return h("div", { class: "facts" },
    h("small", { class: "muted" }, "Expected facts in this answer"),
    h("div", { class: "fact-list" }, ...expected.map((fact) => {
      const found = fact.split("|").some((alt) => text.includes(plain(alt.trim())));
      return h("span", { class: `fact${found ? " found" : ""}` },
        svg(found ? icons.check : icons.x), fact.split("|")[0]);
    })));
}

/** Answer text with **bold** and `code` spans; everything else stays plain text. */
function answerText(text: string): HTMLElement {
  const el = h("div", { class: "answer-text" });
  for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
    if (part.startsWith("**") && part.endsWith("**")) el.appendChild(h("b", {}, part.slice(2, -2)));
    else if (part.startsWith("`") && part.endsWith("`")) el.appendChild(h("code", {}, part.slice(1, -1)));
    else if (part) el.appendChild(document.createTextNode(part));
  }
  return el;
}

function evidenceItem(doc: Doc): HTMLElement {
  const title = doc.url
    ? h("a", { href: doc.url, target: "_blank", rel: "noopener" }, doc.title, svg(icons.external))
    : h("span", {}, doc.title);
  return h("li", { class: "evidence" }, logo(doc.source ?? "", 20),
    h("span", { class: "doc-body" }, title,
      h("small", {}, `${brandName(doc.source ?? "")} · ${doc.external_id ?? ""}`)));
}

function evidenceBlock(e: Evidence): HTMLElement | null {
  if (!e.documents.length && !e.graph.nodes) return null;
  return h("div", { class: "evidence-block" },
    h("small", { class: "muted" }, `Evidence · ${e.documents.length} connector documents`),
    h("ul", { class: "docs" }, ...e.documents.map(evidenceItem)),
    e.graph.nodes || e.graph.edges ? h("div", { class: "graph-used" },
      h("small", { class: "muted" }, `Graph context · ${e.graph.nodes} nodes, ${e.graph.edges} edges`),
      e.graph.relations.length
        ? h("span", { class: "relations" }, ...e.graph.relations.map((r) => h("code", {}, r)))
        : null) : null);
}

function answerCard(a: Answer, memorySources: string[], question?: Question): HTMLElement {
  const body = a.error
    ? h("div", { class: "result", "data-ok": "false" }, svg(icons.x), h("span", {}, a.error))
    : answerText(a.answer || "No answer.");
  return h("article", { class: `card answer${a.memory === "combined" ? " highlight" : ""}` },
    h("div", { class: "answer-head" },
      h("span", { class: "logo-stack" }, ...memorySources.map((s) => logo(s, 24))),
      h("div", {}, h("b", {}, a.label), h("code", { class: "muted" }, a.dataset)),
      h("small", { class: "muted" }, a.elapsed_ms ? `${(a.elapsed_ms / 1000).toFixed(1)} s` : "")),
    body,
    question && !a.error ? factChecks(a.answer, question.expected) : null,
    evidenceBlock(a.evidence),
    a.context ? h("details", { class: "context" }, h("summary", {}, "Context cognee retrieved"),
      h("pre", {}, a.context)) : null);
}

function skeleton(label: string, sources: string[]): HTMLElement {
  return h("article", { class: "card answer loading-card" },
    h("div", { class: "answer-head" },
      h("span", { class: "logo-stack" }, ...sources.map((s) => logo(s, 24))), h("b", {}, label)),
    h("div", { class: "shimmer" }), h("div", { class: "shimmer short" }), h("div", { class: "shimmer" }));
}

export function askView(app: App): HTMLElement {
  const { questions, memories } = app.state;
  const sourcesOf = (id: string) => memories.find((m) => m.id === id)?.sources ?? [];
  const box = h("textarea", { rows: 3, placeholder: "Ask anything about your pipelines and data…" });
  const results = h("div", { class: "answers" });
  let preset: Question | undefined;

  const ask = h("button", { class: "btn primary", disabled: !llmReady(app.state) },
    svg(icons.spark), "Ask all three memories");

  function show(result: AskResult): void {
    const q = questions.find((x) => x.text === result.question);
    results.replaceChildren(...result.results.map((a) => answerCard(a, sourcesOf(a.memory), q)));
  }

  function pick(q: Question): void {
    preset = q;
    box.value = q.text;
    chips.querySelectorAll(".question").forEach((el) =>
      el.classList.toggle("selected", (el as HTMLElement).dataset.id === q.id));
  }

  const chips = h("div", { class: "questions" }, ...questions.map((q) => h("button", {
    class: "question", "data-id": q.id, type: "button", onclick: () => pick(q),
  }, h("span", { class: "logo-stack" }, ...NEEDS[q.needs].map((s) => logo(s, 18))),
  h("span", {}, q.text))));

  box.addEventListener("input", () => {
    if (preset && box.value !== preset.text) {
      preset = undefined;
      chips.querySelectorAll(".question").forEach((el) => el.classList.remove("selected"));
    }
  });

  ask.addEventListener("click", () => busy(ask, async () => {
    const question = box.value.trim();
    if (!question) return;
    results.replaceChildren(...memories.map((m) => skeleton(m.label, m.sources)));
    try {
      app.lastAsk = await api.ask(question);
      show(app.lastAsk);
    } catch (err) {
      results.replaceChildren(h("div", { class: "result", "data-ok": "false" }, svg(icons.x),
        h("span", {}, (err as Error).message)));
    }
  }));

  if (app.lastAsk) {
    box.value = app.lastAsk.question;
    const q = questions.find((x) => x.text === app.lastAsk!.question);
    if (q) pick(q);
    show(app.lastAsk);
  } else {
    results.replaceChildren(...memories.map((m) => h("article", { class: "card answer placeholder" },
      h("div", { class: "answer-head" },
        h("span", { class: "logo-stack" }, ...m.sources.map((s) => logo(s, 24))),
        h("div", {}, h("b", {}, m.label), h("code", { class: "muted" }, m.dataset))),
      h("p", { class: "muted" }, "The answer from this memory appears here."))));
  }

  return h("div", { class: "stack" },
    h("section", { class: "card" },
      h("div", { class: "card-head" }, h("div", {}, h("h3", {}, "Pick a question, or write your own"),
        h("p", {}, "The logos show which systems a complete answer needs."))),
      chips,
      h("div", { class: "ask-box" }, box, ask),
      llmReady(app.state) ? null : h("p", { class: "note" },
        h("a", { href: "#/connect" }, "Choose an AI model"), " to ask questions.")),
    results);
}
