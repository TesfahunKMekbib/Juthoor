import type { ParticipantContext, ParticipantResolver } from '../common/identity/participant.js';

/** Fixed participant used when the dev participant is enabled (ADR-0010 §2). No user document exists. */
export const DEV_PARTICIPANT_ID = '000000000000000000000d01';
export const DEV_PARTICIPANT_HEADER = 'X-Juthoor-Dev-Participant';

export class DevParticipantResolver implements ParticipantResolver {
  resolve(): ParticipantContext {
    return { participantId: DEV_PARTICIPANT_ID };
  }
}

/** Marks every response so a misconfigured deployment is visible (ADR-0010 §5). */
export function devParticipantHeader(
  _req: unknown,
  res: { setHeader(name: string, value: string): unknown },
  next: () => void,
): void {
  res.setHeader(DEV_PARTICIPANT_HEADER, 'true');
  next();
}
