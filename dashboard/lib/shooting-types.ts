// B23 Pydantic response schema handoff; fields always serialized by FastAPI.
export interface AftermathAnchor {
  game_id: string;
  possession_number: number | null;
  branch: "made" | "missed_recovery" | "missed_no_observed_recovery" | "unknown";
  shot_points: number;
  first_chance_points: number | null;
  continued_points: number | null;
  next_opponent_points: number | null;
  next_status: "observed" | "missing" | "censored";
  reason: string | null;
}
export interface AftermathSummary {
  branch: string;
  anchors: number;
  games: number;
  continued_samples: number;
  opponent_samples: number;
  missing_opponent: number;
  censored_opponent: number;
  first_chance_points: number | null;
  continued_points: number | null;
  next_opponent_points: number | null;
  sample_status: "available" | "insufficient_sample" | "empty";
}
export interface AssignmentSummary {
  offensive_player_id: string;
  defensive_player_id: string;
  games: number;
  seconds: number;
  fractional_possessions: number;
  attempts: number;
  makes: number;
  player_points: number;
  team_points: number;
  fg_pct: number | null;
}
export interface ProfilePeer {
  profile: ShotProfile;
  distance: number;
}
export interface ShootingRequest {
  release_id: string | null;
  season: string | null;
  phase: "preseason" | "regular_season" | "play_in" | "playoffs" | "cup_final" | "summer_league" | null;
  before_date: string | null;
  lower_date: string | null;
  player_id: string;
  defender_id: string | null;
  min_attempts: number;
  min_games: number;
  limit: number;
}
export interface ShotFact {
  game_id: string;
  game_date: string;
  player_id: string;
  team_id: string;
  period: number;
  seconds_remaining: number | null;
  shot_value: number;
  made: boolean;
  points: number;
  x_feet: number | null;
  y_feet: number | null;
  distance_feet: number;
  zone: string;
}
export interface ShotProfile {
  player_id: string;
  games: number;
  attempts: number;
  makes: number;
  points: number;
  located_attempts: number;
  unknown_attempts: number;
  sample_status: "available" | "insufficient_sample" | "empty";
  zones: (ZoneSummary)[];
}
export interface ZoneSummary {
  zone: string;
  attempts: number;
  makes: number;
  points: number;
  fg_pct: number | null;
  attempt_share: number | null;
}
export interface ShootingResponse {
  operation: "shot-profile" | "shot-profile-peers" | "matchups" | "shot-aftermath";
  operation_version: string;
  context: Record<string, unknown>;
  request: ShootingRequest;
  coverage_status: "available" | "partial" | "source_blocked";
  expected_games: number;
  observed_games: number;
  excluded_rows: number;
  input_counts: Record<string, number>;
  profile: ShotProfile | null;
  peers: (ProfilePeer)[];
  assignments: (AssignmentSummary)[];
  shots: (ShotFact)[];
  anchors: (AftermathAnchor)[];
  aftermath_summary: (AftermathSummary)[];
  provenance: (Record<string, unknown>)[];
  branch_counts: Record<string, number>;
  input_hash: string;
  evidence_hash: string;
  disclosures: (string)[];
}

export type ShootingOperation = ShootingResponse["operation"];
export type ShootingInput = Pick<ShootingRequest, "player_id" | "min_attempts" | "min_games" | "limit"> & Partial<Omit<ShootingRequest, "player_id" | "min_attempts" | "min_games" | "limit">>;
