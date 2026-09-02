import { session } from '$lib/stores/session.svelte';
import type {
  ApiError,
  CreateRunResponse,
  GameInfo,
  HistoryResponse,
  LeaderboardResponse,
  SessionResponse,
  StatsResponse,
  SubmitPayload,
  SubmitResponse,
  User,
} from './types';

const BASE = '/api';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Zugriffstoken anhängen und bei 401 einmal erneuern. */
  auth?: boolean;
  signal?: AbortSignal;
};

/**
 * Typisierter HTTP-Client. Das Access-Token lebt ausschließlich im Speicher
 * (§8); das Refresh-Cookie schickt der Browser selbst mit (`credentials`).
 */
async function raw<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && session.accessToken) headers.authorization = `Bearer ${session.accessToken}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = parsed as ApiError | null;
    throw new ApiRequestError(
      res.status,
      err?.error?.code ?? 'unknown',
      err?.error?.message ?? 'Unbekannter Fehler',
      err?.error?.fields,
    );
  }
  return parsed as T;
}

let refreshInFlight: Promise<boolean> | null = null;

/** Erneuert das Access-Token; parallele Aufrufe teilen sich eine Anfrage. */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const s = await raw<SessionResponse>('/auth/refresh', { method: 'POST', auth: false });
      session.set(s.user, s.access_token, s.expires_in);
      return true;
    } catch {
      session.clear();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await raw<T>(path, options);
  } catch (err) {
    const unauthorized = err instanceof ApiRequestError && err.status === 401;
    if (!unauthorized || options.auth === false) throw err;
    if (!(await refreshSession())) throw err;
    return raw<T>(path, options);
  }
}

export const api = {
  register(body: { email: string; password: string; display_name: string; timezone?: string }) {
    return request<SessionResponse>('/auth/register', { method: 'POST', body, auth: false });
  },
  login(body: { email: string; password: string }) {
    return request<SessionResponse>('/auth/login', { method: 'POST', body, auth: false });
  },
  logout() {
    return request<void>('/auth/logout', { method: 'POST', auth: false });
  },
  me() {
    return request<User>('/me');
  },
  updateMe(body: { display_name?: string; timezone?: string }) {
    return request<User>('/me', { method: 'PATCH', body });
  },
  games() {
    return request<GameInfo[]>('/games');
  },
  createRun(body: { game_id: string; mode: 'training' | 'ranked' }) {
    return request<CreateRunResponse>('/runs', { method: 'POST', body });
  },
  submitRun(runId: string, body: SubmitPayload) {
    return request<SubmitResponse>(`/runs/${runId}/submit`, { method: 'POST', body });
  },
  leaderboard(gameId: string, period: string, limit = 50, configHash?: string) {
    const q = new URLSearchParams({ period, limit: String(limit) });
    if (configHash) q.set('config_hash', configHash);
    return request<LeaderboardResponse>(`/games/${gameId}/leaderboard?${q}`);
  },
  history(params: { game_id?: string; limit?: number; before?: string } = {}) {
    const q = new URLSearchParams();
    if (params.game_id) q.set('game_id', params.game_id);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.before) q.set('before', params.before);
    return request<HistoryResponse>(`/me/history?${q}`);
  },
  stats() {
    return request<StatsResponse>('/me/stats');
  },
};

export type { ApiError };
