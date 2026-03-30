export function getPreferredTimezone(): string | undefined {
  try {
    const tz = localStorage.getItem('dms_timezone') || (window as any).DMS_TIMEZONE;
    if (!tz) return undefined;
    // map friendly names used in settings to IANA timezone identifiers
    const map: Record<string, string> = {
      'Pacific Time (US & Canada)': 'America/Los_Angeles',
      'Eastern Time (US & Canada)': 'America/New_York',
      'London (GMT)': 'Europe/London',
      'Tokyo (JST)': 'Asia/Tokyo',
      'Philippine Time (PHT)': 'Asia/Manila'
    };
    return map[tz] || tz;
  } catch (e) {
    return undefined;
  }
}

export function formatDate(value: string | number | Date, opts?: Intl.DateTimeFormatOptions) {
  const tz = getPreferredTimezone();
  const date = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  const base: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  const options = Object.assign(base, opts || {});
  try {
    return tz ? date.toLocaleString(undefined, { timeZone: tz, ...options }) : date.toLocaleString(undefined, options);
  } catch (e) {
    return date.toLocaleString();
  }
}

export function formatDateOnly(value: string | number | Date) {
  const tz = getPreferredTimezone();
  const date = typeof value === 'string' || typeof value === 'number' ? new Date(value) : value;
  try {
    return tz ? date.toLocaleDateString(undefined, { timeZone: tz }) : date.toLocaleDateString();
  } catch (e) {
    return date.toLocaleDateString();
  }
}
