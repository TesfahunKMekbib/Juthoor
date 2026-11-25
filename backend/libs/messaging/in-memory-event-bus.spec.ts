import { jest } from '@jest/globals';
import { createEnvelope } from '../contracts/index.js';
import { EventBus } from './event-bus.js';
import { InMemoryEventBus } from './in-memory-event-bus.js';

const evt = (activityId: string) =>
  createEnvelope('ActivitySubmitted', activityId, 'activity-service', {
    userId: 'u1',
    activityTypeCode: 'tree',
    category: 'planting',
    submittedAt: '2026-01-01T00:00:00.000Z',
  });

describe('InMemoryEventBus', () => {
  it('is an EventBus', () => {
    expect(new InMemoryEventBus()).toBeInstanceOf(EventBus);
  });

  it('delivers a published envelope synchronously, carrying the activityId idempotency key (FR-015)', async () => {
    const bus = new InMemoryEventBus();
    const handler = jest.fn();
    bus.subscribe('ActivitySubmitted', handler);
    const e = evt('a1');
    const done = bus.publish(e);
    expect(handler).toHaveBeenCalledWith(e);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ activityId: 'a1' }));
    await done;
  });

  it('delivers only to subscribers of that event type', async () => {
    const bus = new InMemoryEventBus();
    const other = jest.fn();
    bus.subscribe('ActivityAccepted', other);
    await bus.publish(evt('a1'));
    expect(other).not.toHaveBeenCalled();
  });

  it('delivers to every subscriber', async () => {
    const bus = new InMemoryEventBus();
    const a = jest.fn();
    const b = jest.fn();
    bus.subscribe('ActivitySubmitted', a);
    bus.subscribe('ActivitySubmitted', b);
    await bus.publish(evt('a1'));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('stops delivering after unsubscribe', async () => {
    const bus = new InMemoryEventBus();
    const h = jest.fn();
    const off = bus.subscribe('ActivitySubmitted', h);
    off();
    await bus.publish(evt('a1'));
    expect(h).not.toHaveBeenCalled();
  });

  it('isolates a failing subscriber from the publisher and other subscribers (FR-015, FR-028)', async () => {
    const bus = new InMemoryEventBus();
    const failing = jest.fn(() => {
      throw new Error('boom');
    });
    const healthy = jest.fn();
    bus.subscribe('ActivitySubmitted', failing);
    bus.subscribe('ActivitySubmitted', healthy);
    await expect(bus.publish(evt('a1'))).resolves.toBeUndefined();
    expect(failing).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it('does not throw when nobody subscribed', async () => {
    await expect(new InMemoryEventBus().publish(evt('a1'))).resolves.toBeUndefined();
  });

  it('logs an async rejection by event type and activityId only, never the payload', async () => {
    const bus = new InMemoryEventBus();
    const logged: string[] = [];
    jest
      .spyOn((bus as unknown as { logger: { error: (m: string) => void } }).logger, 'error')
      .mockImplementation((m: string) => void logged.push(m));
    bus.subscribe('ActivitySubmitted', () => Promise.reject(new Error('secret-description')));
    await bus.publish(evt('a9'));
    await new Promise((r) => setImmediate(r));
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('ActivitySubmitted');
    expect(logged[0]).toContain('activityId=a9');
    expect(logged[0]).not.toContain('secret-description');
  });

  it('logs a sync throw without the error text, and a non-Error as generic', async () => {
    const bus = new InMemoryEventBus();
    const logged: string[] = [];
    jest
      .spyOn((bus as unknown as { logger: { error: (m: string) => void } }).logger, 'error')
      .mockImplementation((m: string) => void logged.push(m));
    bus.subscribe('ActivitySubmitted', () => {
      throw new Error('secret-description');
    });
    bus.subscribe('ActivitySubmitted', () => {
      throw 'plain';
    });
    await bus.publish(evt('a2'));
    expect(logged[0]).toContain('Error');
    expect(logged[1]).toMatch(/failed \(activityId=a2\): error$/);
    expect(logged.join()).not.toContain('secret-description');
  });

  it('runs an async handler to completion', async () => {
    const bus = new InMemoryEventBus();
    let done = false;
    bus.subscribe('ActivitySubmitted', async () => {
      await Promise.resolve();
      done = true;
    });
    await bus.publish(evt('a1'));
    await new Promise((r) => setImmediate(r));
    expect(done).toBe(true);
  });
});
