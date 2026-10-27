// Brand marks. Airflow, DataHub and cognee use their official logo files (public/logos,
// taken from the Airflow UI, the DataHub frontend and cognee-frontend). AI providers use
// simple-icons glyphs where it has them, and a neutral monogram otherwise.
import { siAnthropic, siGooglegemini, siOllama, siOpenrouter } from "simple-icons";
import { h } from "./dom";

interface Mark {
  name: string;
  color: string;
  file?: string;
  path?: string;
  monogram?: string;
}

const MARKS: Record<string, Mark> = {
  airflow: { name: "Apache Airflow", color: "#017CEE", file: "/logos/airflow.svg" },
  datahub: { name: "DataHub", color: "#1890FF", file: "/logos/datahub.png" },
  cognee: { name: "cognee", color: "#18181B", file: "/logos/cognee.svg" },
  openai: { name: "OpenAI", color: "#0F172A", monogram: "AI" },
  anthropic: { name: "Anthropic", color: `#${siAnthropic.hex}`, path: siAnthropic.path },
  gemini: { name: "Gemini", color: `#${siGooglegemini.hex}`, path: siGooglegemini.path },
  groq: { name: "Groq", color: "#F55036", monogram: "g" },
  openrouter: { name: "OpenRouter", color: "#6467F2", path: siOpenrouter.path },
  ollama: { name: "Ollama", color: `#${siOllama.hex}`, path: siOllama.path },
};

/** A square logo tile. `size` is in px. */
export function logo(id: string, size = 32): HTMLElement {
  const mark = MARKS[id] ?? { name: id, color: "#5F6685", monogram: id.slice(0, 2).toUpperCase() };
  const style = `--size:${size}px;--brand:${mark.color}`;
  if (mark.file) {
    return h("span", { class: "logo logo-file", style, title: mark.name },
      h("img", { src: mark.file, alt: mark.name, draggable: "false" }));
  }
  if (mark.path) {
    const el = h("span", { class: "logo", style, title: mark.name });
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${mark.path}"/></svg>`;
    return el;
  }
  return h("span", { class: "logo logo-mono", style, title: mark.name }, mark.monogram ?? "");
}

/** The official cognee wordmark, for the app header. */
export function wordmark(height = 22): HTMLElement {
  return h("img", { class: "wordmark", src: "/logos/cognee-wordmark.svg", alt: "cognee", style: `height:${height}px` });
}

export function brandName(id: string): string {
  return MARKS[id]?.name ?? id;
}
