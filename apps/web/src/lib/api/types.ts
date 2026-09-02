/** Draht-Typen der API (§11). Feldnamen exakt wie in der JSON-Antwort. */

export type ApiError = { error: { code: string; message: string; fields?: FieldError[] } };
export type FieldError = { field: string; message: string };

export type User = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  timezone: string;
  created_at: string;
};

export type SessionResponse = {
  access_token: string;
  expires_in: number;
  user: User;
};

export type RankedRoundInfo = {
  id: string;
  config: unknown;
  config_hash: string;
  trial_count: number;
  ends_at: string;
  played: boolean;
};

export type GameInfo = {
  id: string;
  category: string;
  input_kind: string;
  timing_sensitive: boolean;
  response_model: 'discrete' | 'continuous';
  enabled: boolean;
  max_level: number;
  level?: number;
  runs_played?: number;
  personal_best?: { score: number; config_hash: string };
  ranked_round?: RankedRoundInfo;
};

export type CreateRunResponse = {
  run_id: string;
  game_id: string;
  mode: 'training' | 'ranked';
  seed: number;
  config: unknown;
  config_hash: string;
  trial_count: number;
  level?: number;
  nonce: string;
  server_started_at: string;
  round_ends_at?: string;
};

export type TrialRowPayload = {
  idx: number;
  response: unknown;
  rt_ms: number | null;
  presented_ms: number | null;
  correct: boolean;
};

export type SubmitPayload = {
  nonce: string;
  client_duration_ms: number;
  client_aborted: boolean;
  trials: TrialRowPayload[];
};

export type SubmitResponse = {
  score: number;
  correct_count: number;
  accuracy: number;
  valid: boolean;
  invalid_reason: string | null;
  personal_best: boolean;
  previous_best: number | null;
  level?: { before: number; after: number; changed: boolean };
  rank?: { daily: number; of: number };
  percentile?: number;
  streak: { current: number; extended_today: boolean };
};

export type LeaderboardResponse = {
  game_id: string;
  config_hash: string;
  period: 'daily' | 'weekly' | 'alltime';
  entries: {
    rank: number;
    display_name: string;
    score: number;
    achieved_at: string;
    is_me: boolean;
  }[];
  me?: { rank: number; score: number; of: number };
};

export type HistoryEntry = {
  run_id: string;
  game_id: string;
  mode: 'training' | 'ranked';
  level: number | null;
  config_hash: string;
  score: number | null;
  correct_count: number | null;
  trial_count: number;
  valid: boolean;
  invalid_reason: string | null;
  submitted_at: string;
};

export type HistoryResponse = {
  entries: HistoryEntry[];
  next_before: string | null;
};

export type StatsResponse = {
  streak: number;
  total_runs: number;
  games: {
    game_id: string;
    category: string;
    level: number;
    max_level: number;
    runs_played: number;
    personal_best: number | null;
    percentile: number | null;
    recent_scores: { submitted_at: string; score: number; mode: string }[];
  }[];
  category_percentiles: [string, number][];
  recent: { game_id: string; mode: string; score: number | null; submitted_at: string }[];
};
