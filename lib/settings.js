// Secrets live in storage.local (never synced); everything else in storage.sync.
const SECRET_KEYS = ["token", "jevApiKey"];

export const DEFAULT_HINTS = `AI & Agents : Using or building with AI: coding agents (Claude Code, Codex, Kiro), agent skills and plugins, MCP servers, prompt engineering, RAG, AI platforms and apps, Jev, and posts about working with AI. Tools and skills made specifically for coding agents belong here, even when they produce diagrams or UI. Model execution and serving belong to AI Runtime & Models.
AI Runtime & Models : Running or serving models themselves: model releases and weights, local inference (MLX, Ollama, llama.cpp), GPUs, LLM gateways, model benchmarks. Model serving infrastructure belongs here rather than Systems & Security. Not agent tooling or AI usage tips.
Systems & Security : Infrastructure, operations and security: servers, cloud architecture, networking, databases, infra automation, observability, caching, load testing and capacity, eBPF, OS and kernel, vulnerabilities and intrusion detection. Database operations and tools belong here; general SQL analysis tutorials belong to Research & Discovery. Model serving belongs to AI Runtime & Models.
Software Engineering : How software is designed and built: architecture, system design study and interviews, algorithms, git workflow, testing, code review and developer practice. General system design learning belongs here; tools specifically made for AI coding agents belong to AI & Agents.
Web & UI : Visual and frontend work: UI/UX design, design systems, color palettes, frontend libraries and components, design reference sites and web rendering. Agent-specific skills belong to AI & Agents; general UI components and design references belong here.
Products & Tools : General products and developer tools outside infrastructure and AI: bug trackers, admin and dashboard templates and general SaaS. Load testing, infrastructure and database tools belong to Systems & Security; AI agent tooling belongs to AI & Agents; general UI component libraries belong to Web & UI.
Research & Discovery : General tech and work reading not mainly about AI, infrastructure, software engineering or UI: essays on management, careers and startups, SQL analysis patterns, open-source curiosities and miscellaneous utilities. General SQL analysis tutorials belong here; database operations and tools belong to Systems & Security; software design and development practice belong to Software Engineering.
Personal : Non-work life: shopping and products to buy, clothing, travel and stays, restaurants and food, local services and reservations.
Inbox : Ambiguous: none of the other collections clearly fits, or two or more fit equally well.`;

export const DEFAULT_TAGS = `claude-code : The page is specifically about Anthropic's Claude Code CLI: its docs, features, hooks, skills, plugins, settings, or tips for using it. Not other Claude products and not AI coding in general.
codex : The page is specifically about OpenAI Codex (CLI, app, or agent). Not other OpenAI products.
kiro : The page is specifically about Kiro, the AWS AI IDE / kiro-cli.
jev : The page is about TypeSafe Jev or its System One decision API.
mcp : The page is about the Model Context Protocol: an MCP server, client, or the protocol itself.
agent-skill : The page offers a reusable skill, plugin, rule set, template, or prompt pack that is installed into an AI coding agent. Not a general article about agents.
multi-agent : The page is about running or orchestrating several AI agents or agent sessions together: teams, parallel sessions, agent-to-agent communication, orchestrators.
agent-memory : The page is about memory, context persistence, or context compression for AI agents or LLM sessions.
rag : The page is about retrieval-augmented generation, semantic search, embeddings, or document retrieval for LLMs.
prompting : The page teaches prompt-writing techniques or prompt patterns. Not tools that merely use prompts.
local-llm : The page is about running language models on the user's own machine or server (local inference, MLX, Ollama, llama.cpp, on-device models).
voice-tts : The page is about speech synthesis, voice cloning, or voice/phone AI.
ui-design : The page is about visual or UX design: design principles, design systems, palettes, UI component libraries, design references, or design skills for agents.
observability : The page is about monitoring, logging, metrics, tracing, alerting, or root-cause analysis of running systems.
security : The page is about security: vulnerabilities, CVEs, exploits, attacks, intrusion detection, or security tools.
database : The page is about a database system or SQL: PostgreSQL, ClickHouse, MySQL, query patterns, backup, or database tooling.
infra-as-code : The page is about provisioning or automating infrastructure with code: Terraform, pyinfra, Ansible, cloud architecture diagrams generated from code.
terminal : The page is about a terminal emulator, shell, TUI, or command-line tool as its main subject.
macos : The page is about an app, utility, or technique specific to macOS or Apple Silicon Macs.
curated-list : The page is mainly a curated collection or list of many resources (awesome lists, "N best tools", galleries, link roundups).`;

export const DEFAULTS = {
  // "session": reuse the app.raindrop.io login cookie (internal /v1 API).
  // "token": official REST API with a test token from app.raindrop.io/settings/integrations.
  authMode: "session",
  token: "",
  // Full System One endpoint. Any other host (e.g. a gateway) is granted at runtime when Options saves it.
  jevEndpoint: "https://api.typesafe.ai/v1/systemone",
  jevApiKey: "",
  jevModel: "jev-latest",
  // Below this confidence the bookmark goes to the fallback collection.
  minConfidence: 0.7,
  fallbackCollection: "Inbox",
  // One rule per line: `<host or /regex/> => <collection title or path>`. Checked before Jev.
  rules: "",
  // Jev candidates: `<collection title or path> : <criterion>`. Only listed collections are offered.
  hints: DEFAULT_HINTS,
  // Tags: one Jev yes/no question per vocabulary entry, in the same request as the collection choice.
  autoTags: true,
  // One tag per line: `<tag> : <when it applies>`.
  tagVocab: DEFAULT_TAGS,
  tagThreshold: 0.7,
  maxTags: 4,
  // Right-click saves: read the linked page's title and description. Needs the optional all-sites permission.
  fetchLinkPages: false,
};

export async function loadSettings() {
  const pub = Object.fromEntries(Object.entries(DEFAULTS).filter(([k]) => !SECRET_KEYS.includes(k)));
  const sec = Object.fromEntries(SECRET_KEYS.map((k) => [k, DEFAULTS[k]]));
  const [a, b] = await Promise.all([chrome.storage.sync.get(pub), chrome.storage.local.get(sec)]);
  return { ...DEFAULTS, ...a, ...b };
}

export async function saveSettings(all) {
  const pub = {};
  const sec = {};
  for (const [k, v] of Object.entries(all)) (SECRET_KEYS.includes(k) ? sec : pub)[k] = v;
  await Promise.all([chrome.storage.sync.set(pub), chrome.storage.local.set(sec)]);
}
