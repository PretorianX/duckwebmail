export type TimeZoneId =
  | "UTC"
  | "Europe/London"
  | "Europe/Paris"
  | "Europe/Berlin"
  | "Europe/Warsaw"
  | "Europe/Kyiv"
  | "Europe/Istanbul"
  | "Europe/Moscow"
  | "Africa/Cairo"
  | "Africa/Johannesburg"
  | "Asia/Jerusalem"
  | "Asia/Riyadh"
  | "Asia/Dubai"
  | "Asia/Tehran"
  | "Asia/Karachi"
  | "Asia/Kolkata"
  | "Asia/Dhaka"
  | "Asia/Bangkok"
  | "Asia/Singapore"
  | "Asia/Shanghai"
  | "Asia/Hong_Kong"
  | "Asia/Tokyo"
  | "Asia/Seoul"
  | "Australia/Sydney"
  | "Pacific/Auckland"
  | "America/St_Johns"
  | "America/Halifax"
  | "America/New_York"
  | "America/Chicago"
  | "America/Denver"
  | "America/Los_Angeles"
  | "America/Anchorage"
  | "Pacific/Honolulu"
  | "America/Sao_Paulo"
  | "America/Argentina/Buenos_Aires"
  | "America/Santiago"
  | "America/Mexico_City";

export const TIMEZONE_OPTIONS: ReadonlyArray<{ id: TimeZoneId; label: string }> = [
  { id: "UTC", label: "UTC" },
  { id: "Europe/London", label: "Europe/London" },
  { id: "Europe/Paris", label: "Europe/Paris" },
  { id: "Europe/Berlin", label: "Europe/Berlin" },
  { id: "Europe/Warsaw", label: "Europe/Warsaw" },
  { id: "Europe/Kyiv", label: "Europe/Kyiv" },
  { id: "Europe/Istanbul", label: "Europe/Istanbul" },
  { id: "Europe/Moscow", label: "Europe/Moscow" },
  { id: "Africa/Cairo", label: "Africa/Cairo" },
  { id: "Africa/Johannesburg", label: "Africa/Johannesburg" },
  { id: "Asia/Jerusalem", label: "Asia/Jerusalem" },
  { id: "Asia/Riyadh", label: "Asia/Riyadh" },
  { id: "Asia/Dubai", label: "Asia/Dubai" },
  { id: "Asia/Tehran", label: "Asia/Tehran" },
  { id: "Asia/Karachi", label: "Asia/Karachi" },
  { id: "Asia/Kolkata", label: "Asia/Kolkata" },
  { id: "Asia/Dhaka", label: "Asia/Dhaka" },
  { id: "Asia/Bangkok", label: "Asia/Bangkok" },
  { id: "Asia/Singapore", label: "Asia/Singapore" },
  { id: "Asia/Shanghai", label: "Asia/Shanghai" },
  { id: "Asia/Hong_Kong", label: "Asia/Hong_Kong" },
  { id: "Asia/Tokyo", label: "Asia/Tokyo" },
  { id: "Asia/Seoul", label: "Asia/Seoul" },
  { id: "Australia/Sydney", label: "Australia/Sydney" },
  { id: "Pacific/Auckland", label: "Pacific/Auckland" },
  { id: "America/St_Johns", label: "America/St_Johns" },
  { id: "America/Halifax", label: "America/Halifax" },
  { id: "America/New_York", label: "America/New_York" },
  { id: "America/Chicago", label: "America/Chicago" },
  { id: "America/Denver", label: "America/Denver" },
  { id: "America/Los_Angeles", label: "America/Los_Angeles" },
  { id: "America/Anchorage", label: "America/Anchorage" },
  { id: "Pacific/Honolulu", label: "Pacific/Honolulu" },
  { id: "America/Mexico_City", label: "America/Mexico_City" },
  { id: "America/Sao_Paulo", label: "America/Sao_Paulo" },
  { id: "America/Argentina/Buenos_Aires", label: "America/Argentina/Buenos_Aires" },
  { id: "America/Santiago", label: "America/Santiago" }
];

export function isTimeZoneId(value: unknown): value is TimeZoneId {
  return typeof value === "string" && TIMEZONE_OPTIONS.some((z) => z.id === value);
}


