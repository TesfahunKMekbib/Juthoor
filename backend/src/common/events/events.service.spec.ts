import { jest } from '@jest/globals';
import { EventsService, type ActivitySubmittedEvent } from './events.service.js';

const evt = (activityId: string): ActivitySubmittedEvent => ({
  activityId,
  userId: 'u1',
  activityTypeCode: 'tree',
  category: 'planting',
  amount: { value: 1, unit: 'trees' },
  emirate: 'Dubai',
  doneAt: new Date('2026-01-01'),
});

describe('EventsService', () => {
  it('delivers a published event, carrying the activityId idempotency key (FR-015)', () => {
    const bus = new EventsService();
    const handler = jest.fn();
    bus.subscribe('ActivitySubmitted', handler);
    const e = evt('a1');
    bus.publish('ActivitySubmitted', e);
    expect(handler).toHaveBeenCalledWith(e);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ activityId: 'a1' }));
  });

  it('delivers to every subscriber', () => {
    const bus = new EventsService();
    const a = jest.fn();
    const b = jest.fn();
    bus.subscribe('ActivitySubmitted', a);
    bus.subscribe('ActivitySubmitted', b);
    bus.publish('ActivitySubmitted', evt('a1'));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new EventsService();
    const h = jest.fn();
    const off = bus.subscribe('ActivitySubmitted', h);
    off();
    bus.publish('ActivitySubmitted', evt('a1'));
    expect(h).not.toHaveBeenCalled();
  });

  it('isolates a failing subscriber from the publisher and other subscribers (FR-015, FR-028)', () => {
    const bus = new EventsService();
    const failing = jest.fn(() => {
      throw new Error('boom');
    });
    const healthy = jest.fn();
    bus.subscribe('ActivitySubmitted', failing);
    bus.subscribe('ActivitySubmitted', healthy);
    expect(() => bus.publish('ActivitySubmitted', evt('a1'))).not.toThrow();
    expect(failing).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it('does not throw when nobody subscribed', () => {
    expect(() => new EventsService().publish('ActivitySubmitted', evt('a1'))).not.toThrow();
  });
});
