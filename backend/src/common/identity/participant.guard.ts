import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  PARTICIPANT_RESOLVER,
  type ParticipantRequest,
  type ParticipantResolver,
} from './participant.js';

/** Global guard: every route needs a participant unless marked `@Public()` (ADR-0010, NFR-025). */
@Injectable()
export class ParticipantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(PARTICIPANT_RESOLVER) private readonly resolver: ParticipantResolver,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<ParticipantRequest>();
    const participant = this.resolver.resolve(req);
    if (!participant) throw new UnauthorizedException({ code: 'auth.required', message: 'Authentication required' });
    req.participant = participant;
    return true;
  }
}
