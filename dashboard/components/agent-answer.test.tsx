import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AgentResultBlock, AgentTurnResponse } from "../lib/assistant-v3.generated";
import { agentCellText, resultColumnLabel, reviewDestination, safeAgentUrl, sourceDestination, sourceLabel } from "../lib/agent-answer";
import { parsePositionedMarkdown } from "../lib/markdown";
import { AgentAnswer } from "./agent-answer";
import { AssistantStatusCard } from "./assistant-status-card";

const hash = "a".repeat(64);
const block: AgentResultBlock = { context: { release_id: "retained", season: "2025-26", phase: "regular_season", before_date: "2026-07-01" }, result: { step_id: "r1", operation: "query", operation_version: "fixture", arguments: {}, operation_hash: hash, result_hash: hash, data: {}, rows: Array.from({ length: 12 }, (_, i) => ({ rank: i + 1, player_name: `Player ${i}`, team_tricodes: ["SAS"], blk_per_game: i === 1 ? null : 0 })), evidence: [] } };
export const response: AgentTurnResponse = {
  request_id: "request", thread_id: "thread", turn_id: "turn", status: "answered", mode: "agent",
  answer: { text: "**Wembanyama** leads.[^s1]\n\n- More context.[^s2]" }, assumption: "Reading defense as blocks per game.",
  results: [block], sources: [{ source_id: "s1", origin: "warehouse", operation_hash: hash, title: "Block leaders", publisher: "CourtLens", retrieved_at: "2026-10-07" }, { source_id: "s2", origin: "web", title: "RAPM", publisher: "NBA RAPM", url: "https://nbarapm.com/", retrieved_at: "2026-10-07" }],
  follow_ups: ["Rank by steals", "Explain RAPM"], saveable: true,
  trace: [{ tool: "query_stats", arguments: { metric: "blk_per_game" }, status: "ok", elapsed_ms: 20, rows: 12 }],
  accounting: { provider: "replay", model: "synthetic", prompt_version: "v1", input_tokens: 100, output_tokens: 20, est_cost_usd: 0.002, elapsed_ms: 40, stopped_by_limit: "searches" },
};
const html = (overrides: Partial<AgentTurnResponse> = {}, busy = false) => renderToStaticMarkup(<AgentAnswer answer={{ ...response, ...overrides }} busy={busy} onChoice={() => {}} onRetry={() => {}} />);

describe("AG05 answer components", () => {
  it("leads with safe Markdown, bound source chips, then the assumption and results", () => {
    const rendered = html();
    expect(rendered).toContain("<strong>Wembanyama</strong>");
    expect(rendered).not.toContain("[^s1]"); expect(rendered).toContain("nbarapm.com");
    expect(rendered.indexOf("Wembanyama")).toBeLessThan(rendered.indexOf("Assumption:"));
    expect(rendered.indexOf("Assumption:")).toBeLessThan(rendered.indexOf("query results"));
    expect(rendered).toContain("Sources (2)"); expect(rendered).toContain("retrieved 2026-10-07");
    expect(sourceDestination(response.sources![0], [block], "turn")).toBe(`#answer-turn-result-${hash}`);
    expect(sourceDestination({ ...response.sources![0], operation_hash: "missing" }, [block], "turn")).toBeNull();
  });

  it("renders Databallr metadata without requesting that source", () => {
    expect(sourceLabel({ source_id: "d", origin: "databallr", title: "Impact", publisher: "Databallr", as_of: "2026-10-01" })).toBe("databallr · as of 2026-10-01");
  });

  it("escapes HTML, keeps code literal and rejects unsafe links", () => {
    const rendered = html({ answer: { text: "<script>alert(1)</script>\n\n```\n[^s1]\n```" } });
    expect(rendered).toContain("&lt;script&gt;"); expect(rendered).not.toContain("<script>"); expect(rendered).toContain("[^s1]");
    for (const url of ["javascript:alert(1)", "//unsafe.test", "https://user:pass@test.org", "/\\test", "/bad\nurl"]) expect(safeAgentUrl(url)).toBeNull();
    expect(html({ actions: [{ kind: "navigation", label: "Unsafe", url: "javascript:alert(1)" }] })).not.toContain(">Unsafe<");
  });

  it("marks the exact unverified sentence across emoji and multiline Markdown", () => {
    const text = "🏀 Supported.\r\n\r\n- **Unbound 99.9**\r\n  points.\r\n- Supported again.";
    const chars = Array.from(text); const start = chars.indexOf("U"); const end = Array.from(text.slice(0, text.indexOf("points.") + 7)).length;
    const rendered = html({ answer: { text }, provenance: { unsupported_numbers: ["99.9"], unverified_sentences: [{ text: chars.slice(start, end).join(""), start, end, numbers: ["99.9"] }] } });
    expect(rendered).toContain('class="agent-unverified"'); expect(rendered).toContain("Unverified: these numbers");
    expect(rendered).not.toMatch(/agent-unverified[^>]*>🏀/);
    const positioned = parsePositionedMarkdown(text);
    for (const part of positioned) expect(part.positions).toHaveLength(Array.from(part.text).length);
    expect(positioned[1].positions[0]).toBe(chars.indexOf("*"));
    const code = parsePositionedMarkdown("```\nFirst\n\nLast\n```")[0];
    expect(code.text).toBe("First\n\nLast"); expect(code.positions.every(Number.isFinite)).toBe(true);
  });

  it("renders citations and unverified labeling on an assumption", () => {
    const rendered = html({ assumption: "Using the cited season.[^s2]", provenance: { assumption_unverified: true } });
    expect(rendered).toContain("agent-assumption text-muted agent-unverified");
    const assumption = rendered.slice(rendered.indexOf('class="agent-assumption'), rendered.indexOf('<section id="answer-'));
    expect(assumption).toContain("nbarapm.com"); expect(assumption).not.toContain("[^s2]");
  });

  it("keeps row limits, arrays, unknowns, zeros, rank and recorded units visible", () => {
    const rendered = html();
    expect(rendered).toContain("10 of 12 returned rows"); expect(rendered.slice(0, rendered.indexOf("</table>"))).not.toContain("Player 11"); expect(rendered).toContain("Show all 12 rows");
    expect(rendered).toContain("Rank ("); expect(rendered).toContain(">SAS</td>"); expect(rendered).toContain(">Unknown</td>"); expect(rendered).toContain(">0</td>");
    expect(agentCellText(["SAS", "TOR"])).toBe("SAS, TOR"); expect(agentCellText([])).toBe("Unknown");
    expect(resultColumnLabel("blk per game", { ...block.result, evidence: [{ evidence_id: "e", result_hash: hash, operation_hash: hash, operation_version: "v1", context_fingerprint: hash, entity_id: "1", row_identity: "1", path: "rows.0.blk_per_game", metric: "blk_per_game", metric_version: "v1", unit: "blocks/game", value: 0, input_identity: {} }] })).toBe("Blocks (blocks/game)");
    expect(html({ results: [] })).not.toContain("<table");
  });

  it("shows follow-ups, disables them while busy and exposes trace/accounting collapsed", () => {
    const rendered = html({}, true);
    expect(rendered).toMatch(/disabled=""[^>]*>Rank by steals/);
    expect(rendered).toContain("query_stats"); expect(rendered).toContain("100 / 20"); expect(rendered).toContain("$0.002000 (estimate)");
    expect(rendered).toContain("Stopped at the searches limit"); expect(rendered).toContain("replay · synthetic");
    expect(rendered).toContain('<details class="ask-disclosure ask-how"><summary>How I got this');
    expect(html({ accounting: { ...response.accounting, est_cost_usd: null } })).toContain("Cost unknown");
  });

  it("shows limited-mode, failure and retry timing without a terminal clarification", () => {
    const rendered = html({ mode: "limited", status: "failed", failure: "provider_quota", retry_after: 60 });
    expect(rendered).toContain("Limited mode: add a provider key"); expect(rendered).toContain("provider quota"); expect(rendered).toContain("Retry after 60 seconds"); expect(rendered).toContain("Retry question");
  });

  it("pins review links to the executed result and suppresses saving web prose", () => {
    const href = reviewDestination(block)!;
    expect(new URL(href, "https://local.test").searchParams.get("release_id")).toBe("retained");
    expect(new URL(href, "https://local.test").searchParams.get("before_date")).toBe("2026-07-01");
    expect(reviewDestination({ ...block, context: null })).toBeNull();
    expect(html()).toContain("Review and save query"); expect(html({ saveable: false, results: [] })).not.toContain("Review and save");
  });

  it("reports provider/model/agent limits and handles unavailable Settings", () => {
    const rendered = renderToStaticMarkup(<AssistantStatusCard status={{ configured: true, provider: "openai", model: "fixture-model", limited_mode: false, limits: { max_steps: 6, max_web_searches: 3, max_tokens: 60000, turn_timeout_seconds: 60, max_rounds: 1, max_total_tool_calls: 8, max_rows_per_call: 25, max_total_rows: 200, timeout_seconds: 45 }, allowed_tools: [], privacy_notice: "Local history", setup_instructions: "Server environment only" }} />);
    expect(rendered).toContain("openai"); expect(rendered).toContain("fixture-model"); expect(rendered).toContain("60,000 tokens"); expect(rendered).toContain("<dd>No</dd>");
    expect(renderToStaticMarkup(<AssistantStatusCard status={null} />)).toContain("configuration is unavailable");
  });
});
