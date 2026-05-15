import { describe, expect, it } from 'vitest';
import { getLiveActivityActionText } from '../components/LiveActivityFeed';
import type { LiveActivityNotification } from '../hooks/useLiveActivity';

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
