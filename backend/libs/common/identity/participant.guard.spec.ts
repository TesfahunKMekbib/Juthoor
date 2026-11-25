import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  NoParticipantResolver,
  type ParticipantRequest,
  type ParticipantResolver,
} from './participant.js';
import { ParticipantGuard } from './participant.guard.js';

function ctx(req: ParticipantRequest, isPublic = false) {
  const reflector = {
    getAllAndOverride: (key: string) => (key === IS_PUBLIC_KEY ? isPublic : undefined),
  } as unknown as Reflector;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { reflector, context };
}

describe('ParticipantGuard (ADR-0010)', () => {
  it('answers 401 auth.required with the default resolver (NFR-025)', () => {
    const { reflector, context } = ctx({});
    const guard = new ParticipantGuard(reflector, new NoParticipantResolver());
    try {
      guard.canActivate(context);
      throw new Error('should not pass');
    } catch (e) {
      expect(e).toBeInstanceOf(UnauthorizedException);
      expect((e as UnauthorizedException).getResponse()).toMatchObject({ code: 'auth.required' });
    }
  });

  it('stores the resolved participant on the request', () => {
    const req: ParticipantRequest = {};
    const resolver: ParticipantResolver = { resolve: () => ({ participantId: 'p1' }) };
    const { reflector, context } = ctx(req);
    expect(new ParticipantGuard(reflector, resolver).canActivate(context)).toBe(true);
    expect(req.participant).toEqual({ participantId: 'p1' });
  });

  it('lets @Public() routes through without resolving', () => {
    const resolver: ParticipantResolver = {
      resolve: () => {
        throw new Error('must not be called');
      },
    };
    const { reflector, context } = ctx({}, true);
    expect(new ParticipantGuard(reflector, resolver).canActivate(context)).toBe(true);
  });

  it('never trusts a client-supplied participant header', () => {
    const { reflector, context } = ctx({ headers: { 'x-participant-id': 'attacker' } });
    expect(() => new ParticipantGuard(reflector, new NoParticipantResolver()).canActivate(context)).toThrow(
      UnauthorizedException,
    );
  });
});
