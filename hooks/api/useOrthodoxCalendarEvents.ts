import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';

export function useOrthodoxCalendarEvents(year: number) {
  return useQuery({
    queryKey: ['orthodox_calendar_events', year],
    queryFn: () => api.getOrthodoxCalendarEvents(year),
    staleTime: 12 * 60 * 60 * 1000
  });
}
