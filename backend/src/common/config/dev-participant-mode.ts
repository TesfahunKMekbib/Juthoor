export type DevParticipantMode = 'enabled' | 'disabled' | 'forbidden';
type Env = Record<string, string | undefined>;

/**
 * ADR-0010 §3 (pure). The dev participant is enabled only when NODE_ENV is exactly "development" and
 * JUTHOOR_DEV_PARTICIPANT is exactly "true". The flag set to any value under another NODE_ENV is
 * "forbidden" and must stop the process before it listens.
 */
export function devParticipantMode(env: Env): DevParticipantMode {
  const flag = env.JUTHOOR_DEV_PARTICIPANT;
  if (flag === undefined) return 'disabled';
  if (env.NODE_ENV !== 'development') return 'forbidden';
  return flag === 'true' ? 'enabled' : 'disabled';
}

/** Fail-fast boot check called by main.ts before NestFactory.create (ADR-0010 §3). */
export function assertDevParticipantAllowed(env: Env): void {
  if (devParticipantMode(env) === 'forbidden') {
    throw new Error('JUTHOOR_DEV_PARTICIPANT is set but NODE_ENV is not "development". Refusing to start (ADR-0010).');
  }
}
