/** Calendar date, `YYYY-MM-DD`. For all-day events the end date is exclusive (D-005). */
export type PlainDate = string;

/** Wall-clock date and time, `YYYY-MM-DDTHH:mm`, with no offset (D-005). */
export type PlainDateTime = string;

/** IANA time-zone id, e.g. `Asia/Riyadh`. */
export type TimeZoneId = string;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
