export type RealtimeChannelStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR'
  | string;

export function shouldRetryRealtimeChannelOnStatus(status: RealtimeChannelStatus): boolean {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED';
}

export function shouldRemoveRealtimeChannelOnStatus(status: RealtimeChannelStatus): boolean {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT';
}
