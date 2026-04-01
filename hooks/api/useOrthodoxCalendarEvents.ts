import { useQuery } from '@tanstack/react-query';
import { deliveriesRepository, deliveryKeys } from '../../features/deliveries';

export function useOrthodoxCalendarEvents(year: number) {
  return useQuery({
    queryKey: deliveryKeys.calendar(year),
    queryFn: () => deliveriesRepository.getOrthodoxCalendarEvents(year),
    staleTime: 12 * 60 * 60 * 1000
  });
}
