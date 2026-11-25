import { jest } from '@jest/globals';
import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ParticipantGuard } from '../common/identity/participant.guard.js';
import type { ParticipantRequest } from '../common/identity/participant.js';
import {
  DEV_PARTICIPANT_HEADER,
  DEV_PARTICIPANT_ID,
  DevParticipantResolver,
  devParticipantHeader,
} from './dev-participant.js';

describe('dev participant (ADR-0010)', () => {
  it('resolves the fixed dev participant ID', () => {
    expect(new DevParticipantResolver().resolve()).toEqual({ participantId: DEV_PARTICIPANT_ID });
    expect(DEV_PARTICIPANT_ID).toMatch(/^[0-9a-f]{24}$/);
  });

  it('lets the global guard attach the dev participant to the request', () => {
    const req: ParticipantRequest = {};
    const context = {
      getHandler: () => () => undefined,
      getClass: () => class Target {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    const guard = new ParticipantGuard(new Reflector(), new DevParticipantResolver());
    expect(guard.canActivate(context)).toBe(true);
    expect(req.participant?.participantId).toBe(DEV_PARTICIPANT_ID);
  });

  it('adds the X-Juthoor-Dev-Participant response header', () => {
    const setHeader = jest.fn();
    const next = jest.fn();
    devParticipantHeader({}, { setHeader }, next);
    expect(setHeader).toHaveBeenCalledWith(DEV_PARTICIPANT_HEADER, 'true');
    expect(next).toHaveBeenCalled();
  });
});
