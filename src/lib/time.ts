export const TIMEZONE = "Asia/Bangkok";

export interface NotifyHours {
  /** 0 = Sunday … 6 = Saturday */
  days: number[];
  start: string; // "08:30"
  end: string; // "20:00"
  /** ISO dates (YYYY-MM-DD) with no reminders */
  holidays: string[];
}

export const DEFAULT_NOTIFY_HOURS: NotifyHours = {
  days: [0, 1, 2, 3, 4, 5, 6],
  start: "08:30",
  end: "20:00",
  holidays: [],
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function bangkokParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    isoDate: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: WEEKDAYS.indexOf(get("weekday")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function isWithinNotifyHours(date: Date, hours: NotifyHours): boolean {
  const { isoDate, weekday, minutes } = bangkokParts(date);
  if (hours.holidays.includes(isoDate)) return false;
  if (!hours.days.includes(weekday)) return false;
  return minutes >= toMinutes(hours.start) && minutes < toMinutes(hours.end);
}

export function formatThai(value: Date | string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH", {
    timeZone: TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
