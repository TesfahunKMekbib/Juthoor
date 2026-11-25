import { jest } from '@jest/globals';
import { createEnvelope, type EventEnvelope } from '../contracts/index.js';
import { InMemoryEventBus } from './in-memory-event-bus.js';
import { InMemoryOutboxStore, OutboxRelay, type OutboxStore } from './outbox.js';

const env = (id: string): EventEnvelope =>
  createEnvelope('ActivitySubmitted', id, 'activity-service', {
    userId: 'u1',
    activityTypeCode: 'tree',
    category: 'planting',
    submittedAt: '2026-01-01T00:00:00.000Z',
  });

const AT = new Date('2026-11-25T10:00:00.000Z');

function setup(ids: string[] = ['a1', 'a2']) {
  const store = new InMemoryOutboxStore();
  for (const id of ids) store.add({ ownerId: `doc-${id}`, envelope: env(id) });
  const bus = new InMemoryEventBus();
  const seen: string[] = [];
  bus.subscribe('ActivitySubmitted', (e) => seen.push(e.eventId));
  const relay = new OutboxRelay(store, bus, { pollMs: 1000, batchSize: 10 }, () => AT);
  return { store, bus, seen, relay };
}

describe('OutboxRelay', () => {
  it('publishes pending events and marks them sent (FR-015, FR-028)', async () => {
    const { store, seen, relay } = setup();
    await expect(relay.runOnce()).resolves.toEqual({ sent: 2, failed: 0 });
    expect(seen).toEqual(['ActivitySubmitted:a1', 'ActivitySubmitted:a2']);
    expect(store.sentAt('ActivitySubmitted:a1')).toEqual(AT);
  });

  it('does not publish a sent event again on a re-run', async () => {
    const { seen, relay } = setup();
    await relay.runOnce();
    await expect(relay.runOnce()).resolves.toEqual({ sent: 0, failed: 0 });
    expect(seen).toHaveLength(2);
  });

  it('respects the batch size', async () => {
    const { store, bus, seen } = setup(['a1', 'a2', 'a3']);
    const relay = new OutboxRelay(store, bus, { pollMs: 1000, batchSize: 2 });
    expect((await relay.runOnce()).sent).toBe(2);
    expect((await relay.runOnce()).sent).toBe(1);
    expect(seen).toHaveLength(3);
  });

  it('keeps a failed publish pending, retries it next run and still sends the others', async () => {
    const { store, bus, seen, relay } = setup();
    const real = bus.publish.bind(bus);
    let fail = true;
    jest
      .spyOn(bus, 'publish')
      .mockImplementation((e) => (fail && e.activityId === 'a1' ? Promise.reject(new Error('broker down')) : real(e)));
    await expect(relay.runOnce()).resolves.toEqual({ sent: 1, failed: 1 });
    expect(store.sentAt('ActivitySubmitted:a1')).toBeNull();
    expect(seen).toEqual(['ActivitySubmitted:a2']);
    fail = false;
    await expect(relay.runOnce()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(seen).toEqual(['ActivitySubmitted:a2', 'ActivitySubmitted:a1']);
  });

  it('retries when marking sent fails (at-least-once) and logs only the eventId', async () => {
    const { store, bus, seen } = setup(['a1']);
    const logged: string[] = [];
    const failing: OutboxStore = {
      findPending: (n) => store.findPending(n),
      markSent: jest
        .fn<OutboxStore['markSent']>()
        .mockRejectedValueOnce('db')
        .mockImplementation((o, e, a) => store.markSent(o, e, a)),
    };
    const relay = new OutboxRelay(failing, bus, { pollMs: 1000, batchSize: 10 });
    jest
      .spyOn((relay as unknown as { logger: { error: (m: string) => void } }).logger, 'error')
      .mockImplementation((m: string) => void logged.push(m));
    expect((await relay.runOnce()).failed).toBe(1);
    expect((await relay.runOnce()).sent).toBe(1);
    expect(seen).toEqual(['ActivitySubmitted:a1', 'ActivitySubmitted:a1']); // consumers must be idempotent
    expect(logged[0]).toContain('eventId=ActivitySubmitted:a1');
    await relay.runOnce();
    expect(seen).toHaveLength(2);
  });

  it('survives a failing outbox read', async () => {
    const { bus } = setup();
    const store: OutboxStore = {
      findPending: () => Promise.reject(new Error('db')),
      markSent: () => Promise.resolve(),
    };
    const relay = new OutboxRelay(store, bus, { pollMs: 1000, batchSize: 1 });
    jest
      .spyOn((relay as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);
    await expect(relay.runOnce()).resolves.toEqual({ sent: 0, failed: 0 });
  });

  it('joins a pass that is already running instead of publishing twice', async () => {
    const { seen, relay } = setup(['a1']);
    const [x, y] = await Promise.all([relay.runOnce(), relay.runOnce()]);
    expect(x).toBe(y);
    expect(seen).toHaveLength(1);
  });

  it('polls on the interval after start() and stops cleanly', async () => {
    jest.useFakeTimers();
    try {
      const { store, seen, relay } = setup(['a1']);
      relay.start();
      relay.start(); // second start is a no-op
      await jest.advanceTimersByTimeAsync(1000);
      expect(seen).toEqual(['ActivitySubmitted:a1']);
      await relay.stop();
      await relay.stop();
      store.add({ ownerId: 'x', envelope: env('a3') });
      await jest.advanceTimersByTimeAsync(5000);
      expect(seen).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('InMemoryOutboxStore ignores marking an unknown entry and keeps the first sent time', async () => {
    const store = new InMemoryOutboxStore();
    store.add({ ownerId: 'o', envelope: env('a1') });
    await store.markSent('o', 'nope', AT);
    await store.markSent('o', 'ActivitySubmitted:a1', AT);
    await store.markSent('o', 'ActivitySubmitted:a1', new Date(0));
    expect(store.sentAt('ActivitySubmitted:a1')).toEqual(AT);
    expect(store.sentAt('missing')).toBeUndefined();
  });
});
