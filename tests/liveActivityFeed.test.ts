import { describe, expect, it } from 'vitest';
import { getLiveActivityActionText } from '../components/LiveActivityFeed';
import {
  appendUniqueLiveActivityNotification,
  drainLiveActivityQueue,
  type BroadcastEnvelope,
  type LiveActivityNotification,
} from '../hooks/useLiveActivity';

const baseNotification: Omit<LiveActivityNotification, 'type' | 'receivedAt'> = {
  userName: 'Alex Papas',
  senderTabId: 'other-tab',
  eventId: 'event-1',
  timestamp: '2026-05-15T08:00:00.000Z',
};

describe('product live activity text', () => {
  it('shows the full SKU when a product variant is created', () => {
    const text = getLiveActivityActionText({
      ...baseNotification,
      type: 'product_variant_created',
      sku: 'RN123',
      variantSuffix: 'P',
      receivedAt: Date.now(),
    });

    expect(text.line1).toContain('Alex');
    expect(`${text.line1} ${text.line2 || ''}`).toContain('RN123P');
  });
});

describe('live activity realtime helpers', () => {
  it('flushes queued outbound events once when realtime subscribes', () => {
    const queued: BroadcastEnvelope[] = [
      { ...baseNotification, type: 'batch_moved', toStage: 'Casting' },
      { ...baseNotification, eventId: 'event-2', type: 'batch_bulk_moved', count: 2 },
    ];
    const sent: BroadcastEnvelope[] = [];

    const remaining = drainLiveActivityQueue(queued, (event) => sent.push(event));
    const remainingAfterSecondFlush = drainLiveActivityQueue(remaining, (event) => sent.push(event));

    expect(sent.map((event) => event.eventId)).toEqual(['event-1', 'event-2']);
    expect(remaining).toEqual([]);
    expect(remainingAfterSecondFlush).toEqual([]);
  });

  it('deduplicates received notifications by event id', () => {
    const notification = {
      ...baseNotification,
      type: 'batch_moved',
      toStage: 'Casting',
      receivedAt: Date.now(),
    } as LiveActivityNotification;

    const once = appendUniqueLiveActivityNotification([], notification, 5);
    const twice = appendUniqueLiveActivityNotification(once, notification, 5);

    expect(twice).toHaveLength(1);
    expect(twice[0].eventId).toBe('event-1');
  });
});
