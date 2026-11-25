/** Pure call/time budget accounting for one verification attempt (ADR-0012 section 6, AC 26, NFR-002). */
export interface BudgetConfig {
  maxCalls: number;
  totalBudgetMs: number;
  /** Optional calls (repair, follow-up) are skipped when less time than this remains. */
  minCallMs: number;
  /** Per-call timeout (AI_TIMEOUT_MS); capped by the remaining budget. */
  perCallTimeoutMs: number;
}

export interface BudgetState {
  startedAtMs: number;
  callsUsed: number;
}

/** `required` = evidence / claim; `optional` = repair / follow-up. */
export type CallKind = 'required' | 'optional';

export type BudgetDecision =
  | { allowed: true; timeoutMs: number }
  | { allowed: false; reason: 'max_calls' | 'budget_exhausted' | 'too_little_time' };

export const startBudget = (nowMs: number): BudgetState => ({ startedAtMs: nowMs, callsUsed: 0 });

export const recordCall = (state: BudgetState): BudgetState => ({ ...state, callsUsed: state.callsUsed + 1 });

export function remainingMs(config: BudgetConfig, state: BudgetState, nowMs: number): number {
  return Math.max(0, config.totalBudgetMs - (nowMs - state.startedAtMs));
}

export function requestCall(config: BudgetConfig, state: BudgetState, nowMs: number, kind: CallKind): BudgetDecision {
  if (state.callsUsed >= config.maxCalls) return { allowed: false, reason: 'max_calls' };
  const remaining = remainingMs(config, state, nowMs);
  if (remaining <= 0) return { allowed: false, reason: 'budget_exhausted' };
  if (kind === 'optional' && remaining < config.minCallMs) return { allowed: false, reason: 'too_little_time' };
  return { allowed: true, timeoutMs: Math.min(config.perCallTimeoutMs, remaining) };
}
