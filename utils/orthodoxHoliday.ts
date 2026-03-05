import { DeliveryHolidayAnchor } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function getOrthodoxEaster(year: number): Date {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;

  const julian = new Date(Date.UTC(year, month - 1, day));
  julian.setUTCDate(julian.getUTCDate() + 13);
  julian.setUTCDate(julian.getUTCDate() + 7);
  return julian;
}

export function getHolidayAnchorDate(anchor: DeliveryHolidayAnchor, year: number, offsetDays = 0): Date {
  const base = anchor === 'orthodox_easter'
    ? getOrthodoxEaster(year)
    : new Date(Date.UTC(year, 11, 25, 9, 0, 0));

  return new Date(base.getTime() + (offsetDays * DAY_MS));
}

export function getHolidayPeriod(anchor: DeliveryHolidayAnchor, year: number, offsetDays = 0): { start: Date; end: Date; target: Date } {
  const target = getHolidayAnchorDate(anchor, year, offsetDays);

  if (anchor === 'orthodox_christmas') {
    return {
      start: new Date(Date.UTC(year, 11, 1, 0, 0, 0)),
      end: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
      target
    };
  }

  return {
    start: new Date(target.getTime() - (14 * DAY_MS)),
    end: new Date(target.getTime() + (2 * DAY_MS)),
    target
  };
}
