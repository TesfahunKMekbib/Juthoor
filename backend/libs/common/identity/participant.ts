import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';

/** Who is calling. Controllers and services only ever see this (ADR-0010; FR-010, NFR-025). */
export interface ParticipantContext {
  participantId: string;
}

/** Minimal request shape the identity seam needs. */
export interface ParticipantRequest {
  participant?: ParticipantContext;
  headers?: Record<string, unknown>;
}

/** Replaceable identity source. A future JWT resolver is bound to this token (FR-001, deferred). */
export interface ParticipantResolver {
  resolve(req: ParticipantRequest): ParticipantContext | null;
}

export const PARTICIPANT_RESOLVER = Symbol('PARTICIPANT_RESOLVER');
export const IS_PUBLIC_KEY = 'juthoor:isPublic';

/** Marks an endpoint that needs no participant (e.g. the activity type catalogue, FR-009). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Resolver used unless another one is bound: nobody is identified, so every guarded route answers 401. */
export class NoParticipantResolver implements ParticipantResolver {
  resolve(): ParticipantContext | null {
    return null;
  }
}

/** Injects the participant set by `ParticipantGuard`; ownership never comes from client-supplied IDs. */
export const CurrentParticipant = createParamDecorator((_data: unknown, ctx: ExecutionContext): ParticipantContext => {
  const req = ctx.switchToHttp().getRequest<ParticipantRequest>();
  return req.participant as ParticipantContext;
});
