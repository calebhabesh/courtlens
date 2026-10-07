"""Assistant provider adapters (Gemini official SDK and deterministic offline fixture provider)."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Protocol

from courtlens.services.assistant.planner import PlanningOutput

logger = logging.getLogger(__name__)


@dataclass
class ProviderCallResult:
    """Normalized turn result from an assistant model provider."""

    tool_calls: list[tuple[str, dict[str, Any]]]
    content: str | None = None
    structured_data: dict[str, Any] | None = None


class AssistantProvider(Protocol):
    """Protocol for assistant LLM provider adapters."""

    def generate(
        self,
        messages: list[dict[str, Any]],
        system_prompt: str,
        tools: list[dict[str, Any]],
    ) -> ProviderCallResult: ...


def extract_json_payload(text: str) -> dict[str, Any] | None:
    """Extract JSON object from markdown code block or raw text."""
    trimmed = text.strip()
    # Try direct parse
    try:
        data = json.loads(trimmed)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    # Try code block extract ```json ... ```
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(1))
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    # Try finding outermost braces { ... }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            data = json.loads(text[start : end + 1])
            if isinstance(data, dict):
                return data
        except Exception:
            pass

    return None


class GeminiAssistantProvider:
    """Official google-genai SDK adapter for Gemini models with tool calling."""

    def __init__(self, api_key: str, model: str = "gemini-3.5-flash-lite") -> None:
        self.api_key = api_key
        self.model = model
        # Lazy import of google.genai so offline code has zero runtime dependency
        from google import genai
        from google.genai import types

        self._client = genai.Client(api_key=api_key)
        self._types = types

    def _convert_tool_declarations(self, declarations: list[dict[str, Any]]) -> list[Any]:
        types = self._types
        sdk_declarations: list[Any] = []
        for decl in declarations:
            name = decl["name"]
            desc = decl["description"]
            props = decl.get("parameters", {}).get("properties", {})
            required = decl.get("parameters", {}).get("required", [])

            prop_schemas = {}
            for p_name, p_info in props.items():
                p_type = p_info.get("type", "string")
                t = types.Type.STRING
                if p_type == "integer":
                    t = types.Type.INTEGER
                elif p_type == "number":
                    t = types.Type.NUMBER
                elif p_type == "boolean":
                    t = types.Type.BOOLEAN
                prop_schemas[p_name] = types.Schema(
                    type=t,
                    description=p_info.get("description", ""),
                )

            param_schema = types.Schema(
                type=types.Type.OBJECT,
                properties=prop_schemas,
                required=required,
            )
            sdk_declarations.append(
                types.FunctionDeclaration(
                    name=name,
                    description=desc,
                    parameters=param_schema,
                )
            )

        return [types.Tool(function_declarations=sdk_declarations)]

    def generate(
        self,
        messages: list[dict[str, Any]],
        system_prompt: str,
        tools: list[dict[str, Any]],
    ) -> ProviderCallResult:
        types = self._types
        tool_objects = self._convert_tool_declarations(tools)

        # Convert conversation messages into Content items
        contents: list[Any] = []
        for msg in messages:
            role = msg.get("role", "user")
            parts: list[Any] = []

            if "tool_calls" in msg:
                # Model turn requesting function calls
                for fn_name, fn_args in msg["tool_calls"]:
                    parts.append(
                        types.Part.from_function_call(
                            name=fn_name,
                            args=fn_args,
                        )
                    )
            elif "tool_responses" in msg:
                # User/Tool turn returning function execution results
                for fn_name, fn_resp in msg["tool_responses"]:
                    resp_dict = fn_resp if isinstance(fn_resp, dict) else {"result": fn_resp}
                    parts.append(
                        types.Part.from_function_response(
                            name=fn_name,
                            response=resp_dict,
                        )
                    )
            elif "content" in msg:
                text = msg["content"]
                if text:
                    parts.append(types.Part.from_text(text=text))

            if parts:
                sdk_role = "model" if role == "model" else "user"
                contents.append(types.Content(role=sdk_role, parts=parts))

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.0,
            max_output_tokens=2000,
            tools=tool_objects,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )

        try:
            response = self._client.models.generate_content(
                model=self.model,
                contents=contents,
                config=config,
            )
        except Exception as exc:
            # Check for transient error or 429 quota
            err_str = str(exc)
            if (
                "429" in err_str
                or "quota" in err_str.lower()
                or "resource_exhausted" in err_str.lower()
            ):
                raise RuntimeError("provider_quota_exceeded") from exc
            if "deadline" in err_str.lower() or "timeout" in err_str.lower():
                raise TimeoutError("provider_timeout") from exc
            raise RuntimeError(f"provider_error: {exc}") from exc

        # Check for function calls in model response
        extracted_tool_calls: list[tuple[str, dict[str, Any]]] = []
        text_content: str = ""

        if response.candidates:
            candidate = response.candidates[0]
            if candidate.content and candidate.content.parts:
                for part in candidate.content.parts:
                    if part.function_call and part.function_call.name:
                        call_name = part.function_call.name
                        call_args = dict(part.function_call.args or {})
                        extracted_tool_calls.append((call_name, call_args))
                    elif part.text:
                        text_content += part.text

        if extracted_tool_calls:
            return ProviderCallResult(tool_calls=extracted_tool_calls)

        structured = extract_json_payload(text_content)
        return ProviderCallResult(
            tool_calls=[],
            content=text_content,
            structured_data=structured,
        )


class OfflineFixtureAssistantProvider:
    """Deterministic offline provider for contract testing without an external API key.

    Implements predictable multi-turn responses for standard research queries,
    verifying tool calls, numerical claim validation, and domain boundary handling.
    """

    def generate(
        self,
        messages: list[dict[str, Any]],
        system_prompt: str,
        tools: list[dict[str, Any]],
    ) -> ProviderCallResult:
        # Determine current round based on message count
        # Message 0: initial user question
        # If last message is tool_responses, this is round 2 (final answer)
        last_msg = messages[-1] if messages else {}
        first_msg = messages[0] if messages else {}
        user_query = str(first_msg.get("content", "")).lower()

        if "tool_responses" in last_msg:
            # Round 2: Tool execution completed, synthesize structured answer
            return self._synthesize_answer(user_query, last_msg["tool_responses"])

        # Round 1: Model decides which allowlisted tool(s) to call
        return self._plan_tool_calls(user_query)

    def _plan_tool_calls(self, query: str) -> ProviderCallResult:
        """Inspect user query and return deterministic tool calls."""
        # 1. Toronto defense / best defenders
        if "raptor" in query and ("defen" in query or "stl" in query or "blk" in query):
            return ProviderCallResult(
                tool_calls=[
                    (
                        "search_players",
                        {
                            "team_id": "1610612761",
                            "sort_metric": "stl_per_game",
                            "sort_direction": "desc",
                            "min_games": 5,
                            "limit": 10,
                        },
                    )
                ]
            )

        # 2. Points forecast explanation for a player
        if "forecast" in query or "estimate" in query:
            player_id = "1630567"  # Default Scottie Barnes if not specified
            if "barrett" in query:
                player_id = "1628369"
            return ProviderCallResult(
                tool_calls=[
                    ("get_forecast", {"player_id": player_id}),
                    ("get_evaluation_summary", {}),
                ]
            )

        # 3. Conference placement or playoff seeding (deferred capability)
        if (
            "conference" in query
            or "playoff" in query
            or "seed" in query
            or "win the east" in query
        ):
            return ProviderCallResult(
                tool_calls=[("get_team_summary", {"team_id": "1610612761", "season": "2023-24"})]
            )

        # 4. Player comparison
        if "compare" in query:
            p_a = "1630567"  # Scottie Barnes
            p_b = "1628369"  # RJ Barrett
            return ProviderCallResult(
                tool_calls=[("compare_players", {"player_a": p_a, "player_b": p_b})]
            )

        # 5. Metric definition
        if "formula" in query or "definition" in query or "what is" in query:
            m_key = "pts_per_game"
            if "efg" in query:
                m_key = "efg_pct"
            elif "ts" in query:
                m_key = "ts_pct"
            return ProviderCallResult(tool_calls=[("get_metric_definition", {"metric_key": m_key})])

        # 6. Scoring leaders / general rank
        if "scoring" in query or "leaders" in query or "pts" in query or "points" in query:
            return ProviderCallResult(
                tool_calls=[
                    (
                        "search_players",
                        {
                            "sort_metric": "pts_per_game",
                            "sort_direction": "desc",
                            "limit": 5,
                        },
                    )
                ]
            )

        # Default fallback: search players
        return ProviderCallResult(
            tool_calls=[("search_players", {"sort_metric": "pts", "limit": 5})]
        )

    def _synthesize_answer(
        self,
        query: str,
        tool_responses: list[tuple[str, Any]],
    ) -> ProviderCallResult:
        """Synthesize final structured answer conforming to AssistantAnswer expectations."""
        responses_dict = {name: data for name, data in tool_responses}

        # 1. Raptors Defense Scenario
        if "raptor" in query and ("defen" in query or "stl" in query or "blk" in query):
            search_res = responses_dict.get("search_players", {})
            items = search_res.get("items", []) if isinstance(search_res, dict) else []

            rows = []
            for item in items[:8]:
                p_name = item.get("player_name", "")
                m = item.get("metrics", {})
                rows.append(
                    {
                        "player_name": p_name,
                        "games_played": item.get("games_played", 0),
                        "total_minutes": round(item.get("total_minutes", 0), 1),
                        "stl_per_game": round(m.get("stl_per_game", 0.0), 2),
                        "blk_per_game": round(m.get("blk_per_game", 0.0), 2),
                        "dreb_per_game": round(m.get("dreb_per_game", 0.0), 2),
                    }
                )

            top_p = items[0].get("player_name", "Leading Player") if items else "Player"
            top_stl = items[0].get("metrics", {}).get("stl_per_game", 0.0) if items else 0.0

            claim_text = (
                f"{top_p} recorded {top_stl:.2f} steals per game across observed appearances."
            )
            structured = {
                "status": "answered",
                "interpretation": (
                    "Evaluated season-scoped box-score defensive metrics for the Toronto Raptors "
                    "with minimum 5 appearances."
                ),
                "supported_claims": [
                    {
                        "statement": claim_text,
                        "subject": top_p,
                        "metric": "stl_per_game",
                        "verified_value": round(top_stl, 2),
                        "unit": "STL/G",
                    }
                ],
                "result_tables": [
                    {
                        "title": "Toronto Raptors Defensive Box-Score Production",
                        "columns": [
                            {"key": "player_name", "label": "Player"},
                            {"key": "games_played", "label": "GP", "align": "right"},
                            {"key": "total_minutes", "label": "MIN", "align": "right"},
                            {"key": "stl_per_game", "label": "STL/G", "align": "right"},
                            {"key": "blk_per_game", "label": "BLK/G", "align": "right"},
                            {"key": "dreb_per_game", "label": "DREB/G", "align": "right"},
                        ],
                        "rows": rows,
                        "row_count": len(rows),
                    }
                ],
                "limitations": [
                    (
                        "CourtLens does not provide an inferred single 'best defender' rating "
                        "or composite defensive metric."
                    ),
                    (
                        "Box-score defensive stats (steals, blocks, rebounds) reflect recorded "
                        "event counts, not overall defensive impact or matchup difficulty."
                    ),
                ],
                "narrative": (
                    "Defensive analysis for the Toronto Raptors based on confirmed box score "
                    "appearances. No single composite defensive metric is inferred."
                ),
            }
            return ProviderCallResult(
                tool_calls=[], content=json.dumps(structured), structured_data=structured
            )

        # 2. Forecast Explanation Scenario
        if "forecast" in query or "estimate" in query:
            forecast_res = responses_dict.get("get_forecast", {})
            f_items = forecast_res.get("items", []) if isinstance(forecast_res, dict) else []
            f_item = f_items[0] if f_items else {}

            pe = f_item.get("point_estimate", 19.4)
            low = f_item.get("interval_lower", 12.0)
            up = f_item.get("interval_upper", 26.8)
            p_name = f_item.get("player_name", "Scottie Barnes")
            pol = f_item.get("policy_id", "points-v1-prior_blend")

            claim_stmt = (
                f"{p_name} has a point estimate of {pe:.1f} points with an empirical 80% "
                f"prediction interval of [{low:.1f}, {up:.1f}] points."
            )
            structured = {
                "status": "answered",
                "interpretation": f"Inspected points forecast for {p_name} under policy {pol}.",
                "supported_claims": [
                    {
                        "statement": claim_stmt,
                        "subject": p_name,
                        "metric": "point_estimate",
                        "verified_value": round(pe, 1),
                        "unit": "PTS",
                    }
                ],
                "result_tables": [
                    {
                        "title": f"Prospective Points Forecast: {p_name}",
                        "columns": [
                            {"key": "property", "label": "Forecast Dimension"},
                            {"key": "value", "label": "Value"},
                        ],
                        "rows": [
                            {"property": "Player", "value": p_name},
                            {"property": "Point Estimate", "value": f"{pe:.1f} PTS"},
                            {
                                "property": "80% Prediction Interval",
                                "value": f"[{low:.1f}, {up:.1f}] PTS",
                            },
                            {"property": "Model Policy", "value": pol},
                            {
                                "property": "Target Metric",
                                "value": "Basketball Points in Next Game",
                            },
                            {
                                "property": "Conditionality",
                                "value": (
                                    "Conditional on player appearing; unplayed games are not 0 PTS"
                                ),
                            },
                        ],
                        "row_count": 6,
                    }
                ],
                "limitations": [
                    (
                        "This forecast is strictly conditional on appearing in the target contest. "
                        "Absent box-score rows (DNP) are never scored as 0 PTS."
                    ),
                    (
                        "Prediction intervals represent empirical out-of-time dispersion "
                        "calibrated on historical validation folds, not subjective confidence."
                    ),
                ],
                "narrative": f"Forecast for {p_name} points production in next appearance.",
            }
            return ProviderCallResult(
                tool_calls=[], content=json.dumps(structured), structured_data=structured
            )

        # 3. Conference Placement Scenario (model_not_available)
        if (
            "conference" in query
            or "playoff" in query
            or "seed" in query
            or "win the east" in query
        ):
            team_res = responses_dict.get("get_team_summary", {})
            record = team_res.get("record", {}) if isinstance(team_res, dict) else {}
            w_raw = record.get("wins") if isinstance(record, dict) else None
            l_raw = record.get("losses") if isinstance(record, dict) else None
            wins: int = int(w_raw) if w_raw is not None else 0
            losses: int = int(l_raw) if l_raw is not None else 0
            raw_win_pct = record.get("win_pct") if isinstance(record, dict) else None
            if raw_win_pct is not None:
                win_pct: float = float(raw_win_pct)
            elif (wins + losses) > 0:
                win_pct = float(wins) / float(wins + losses)
            else:
                win_pct = 0.0

            rec_stmt = (
                f"Toronto Raptors have an observed regular-season record of "
                f"{wins}-{losses} ({win_pct * 100:.1f}%)."
            )
            structured = {
                "status": "model_not_available",
                "interpretation": (
                    "Conference placement prediction and playoff seeding forecasting are deferred "
                    "capabilities and not available in this release."
                ),
                "supported_claims": [
                    {
                        "statement": rec_stmt,
                        "subject": "Toronto Raptors",
                        "metric": "record",
                        "verified_value": f"{wins}-{losses}",
                        "unit": "W-L",
                    }
                ],
                "result_tables": [
                    {
                        "title": "Toronto Raptors Verified Regular-Season Record",
                        "columns": [
                            {"key": "metric", "label": "Record Metric"},
                            {"key": "value", "label": "Observed Value"},
                        ],
                        "rows": [
                            {"metric": "Wins", "value": str(wins)},
                            {"metric": "Losses", "value": str(losses)},
                            {"metric": "Win Percentage", "value": f"{win_pct * 100:.1f}%"},
                            {"metric": "Status", "value": "Observed Box-Score Games"},
                        ],
                        "row_count": 4,
                    }
                ],
                "limitations": [
                    (
                        "Conference placement prediction and official playoff seeding models are "
                        "deferred and not available in this release."
                    ),
                    (
                        "CourtLens reports verified team production and records without inferring "
                        "future conference rankings or playoff probabilities."
                    ),
                ],
                "narrative": (
                    "Conference placement prediction is not available in CourtLens. "
                    "Verified team records are provided as a factual alternative."
                ),
            }
            return ProviderCallResult(
                tool_calls=[], content=json.dumps(structured), structured_data=structured
            )

        # 4. Player Comparison Scenario
        if "compare" in query:
            comp_res = responses_dict.get("compare_players", {})
            aligned = comp_res.get("aligned_metrics", []) if isinstance(comp_res, dict) else []
            p_a = comp_res.get("player_a", {}).get("name", "Player A")
            p_b = comp_res.get("player_b", {}).get("name", "Player B")

            rows = []
            for item in aligned[:8]:
                rows.append(
                    {
                        "metric": item.get("display_name", ""),
                        "value_a": item.get("value_a"),
                        "value_b": item.get("value_b"),
                        "diff": item.get("diff"),
                    }
                )

            comp_claims = []
            if aligned and aligned[0].get("value_a") is not None:
                first_item = aligned[0]
                comp_claims.append(
                    {
                        "statement": (
                            f"{p_a} recorded {first_item.get('value_a')} "
                            f"{first_item.get('display_name')}."
                        ),
                        "subject": p_a,
                        "metric": first_item.get("metric"),
                        "verified_value": first_item.get("value_a"),
                    }
                )

            structured = {
                "status": "answered",
                "interpretation": (
                    f"Compared {p_a} and {p_b} across aligned single-formula metrics under "
                    "identical temporal context."
                ),
                "supported_claims": comp_claims,
                "result_tables": [
                    {
                        "title": f"Aligned Comparison: {p_a} vs {p_b}",
                        "columns": [
                            {"key": "metric", "label": "Metric"},
                            {"key": "value_a", "label": p_a, "align": "right"},
                            {"key": "value_b", "label": p_b, "align": "right"},
                            {"key": "diff", "label": "Difference", "align": "right"},
                        ],
                        "rows": rows,
                        "row_count": len(rows),
                    }
                ],
                "limitations": [
                    "CourtLens reports descriptive differences without declaring a forced winner.",
                ],
                "narrative": f"Comparison between {p_a} and {p_b} under identical boundaries.",
            }
            return ProviderCallResult(
                tool_calls=[], content=json.dumps(structured), structured_data=structured
            )

        # 5. General Scoring Leaders
        search_res = responses_dict.get("search_players", {})
        items = search_res.get("items", []) if isinstance(search_res, dict) else []
        rows = []
        for item in items[:5]:
            rows.append(
                {
                    "player_name": item.get("player_name", ""),
                    "games_played": item.get("games_played", 0),
                    "pts_per_game": round(item.get("metrics", {}).get("pts_per_game", 0.0), 1),
                    "pts": item.get("metrics", {}).get("pts", 0),
                }
            )

        structured = {
            "status": "answered",
            "interpretation": (
                "Queried top NBA players by points per game under active release boundary."
            ),
            "supported_claims": [],
            "result_tables": [
                {
                    "title": "NBA Scoring Leaders",
                    "columns": [
                        {"key": "player_name", "label": "Player"},
                        {"key": "games_played", "label": "GP", "align": "right"},
                        {"key": "pts_per_game", "label": "PPG", "align": "right"},
                        {"key": "pts", "label": "Total PTS", "align": "right"},
                    ],
                    "rows": rows,
                    "row_count": len(rows),
                }
            ],
            "limitations": [
                "Filtered strictly prior to analytical cutoff date.",
            ],
            "narrative": "Verified scoring leaders from active release.",
        }
        return ProviderCallResult(
            tool_calls=[], content=json.dumps(structured), structured_data=structured
        )


class OfflinePlanFixtureProvider:
    """Explicit development fixtures, not a natural-language interpreter."""

    def plan(self, payload: str, *, timeout_seconds: float) -> PlanningOutput:

        question = json.loads(payload)["message"]
        fixtures: dict[str, dict[str, Any]] = {
            "Who are the best defenders on the Raptors?": {
                "status": "clarification_required",
                "clarification": "defense_metric",
            },
            "Explain the next-game points forecast for Scottie Barnes": {
                "steps": [
                    {
                        "step_id": "forecast",
                        "operation": "forecast",
                        "arguments": {"player_id": "1630567"},
                    }
                ]
            },
            "Who will win the Eastern Conference and what are the playoff seeds?": {
                "status": "unsupported",
                "clarification": "capability",
            },
            "Compare Scottie Barnes and RJ Barrett under current season": {
                "steps": [
                    {
                        "step_id": "compare",
                        "operation": "compare",
                        "arguments": {"player_a": "1630567", "player_b": "1628369"},
                    }
                ]
            },
            "Who leads the league in scoring points per game?": {
                "steps": [
                    {
                        "step_id": "rank",
                        "operation": "query",
                        "arguments": {"sort": [{"field": "pts_per_game"}], "page": {"limit": 10}},
                    }
                ]
            },
            "What is the formula and definition for true shooting percentage ts_pct?": {
                "steps": [
                    {
                        "step_id": "definition",
                        "operation": "definition",
                        "arguments": {"metric": "ts_pct"},
                    }
                ]
            },
        }
        return PlanningOutput(
            fixtures.get(question, {"status": "unsupported", "clarification": "capability"})
        )
