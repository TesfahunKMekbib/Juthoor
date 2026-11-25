import { assertDevParticipantAllowed, devParticipantMode } from './dev-participant-mode.js';

describe('devParticipantMode (ADR-0010)', () => {
  it('is enabled only for development + "true"', () => {
    expect(devParticipantMode({ NODE_ENV: 'development', JUTHOOR_DEV_PARTICIPANT: 'true' })).toBe('enabled');
  });
  it.each(['false', 'TRUE', '1', '', 'yes'])('is disabled in development for flag %j', (flag) => {
    expect(devParticipantMode({ NODE_ENV: 'development', JUTHOOR_DEV_PARTICIPANT: flag })).toBe('disabled');
  });
  it.each([undefined, 'development', 'production', 'test'])('is disabled when the flag is unset (NODE_ENV=%s)', (n) => {
    expect(devParticipantMode({ NODE_ENV: n })).toBe('disabled');
  });
  it.each(['production', 'test', 'staging', 'Development', '', undefined])(
    'is forbidden when the flag is set under NODE_ENV=%j',
    (nodeEnv) => {
      expect(devParticipantMode({ NODE_ENV: nodeEnv, JUTHOOR_DEV_PARTICIPANT: 'true' })).toBe('forbidden');
      expect(devParticipantMode({ NODE_ENV: nodeEnv, JUTHOOR_DEV_PARTICIPANT: 'false' })).toBe('forbidden');
    },
  );
});

describe('assertDevParticipantAllowed (boot check)', () => {
  it('throws for production + flag so the process never listens', () => {
    expect(() => assertDevParticipantAllowed({ NODE_ENV: 'production', JUTHOOR_DEV_PARTICIPANT: 'true' })).toThrow(
      /ADR-0010/,
    );
  });
  it('passes for production without the flag and for development with it', () => {
    expect(() => assertDevParticipantAllowed({ NODE_ENV: 'production' })).not.toThrow();
    expect(() =>
      assertDevParticipantAllowed({ NODE_ENV: 'development', JUTHOOR_DEV_PARTICIPANT: 'true' }),
    ).not.toThrow();
  });
});
