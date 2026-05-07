/**
 * Parses a duration string (e.g., "1h", "2d", "30m", "5s") and returns the equivalent seconds.
 * If the input is already a number (in string format), it returns it as a number.
 * Returns null if the format is invalid.
 */
export function parseDurationToSeconds(duration: string): number | null {
  if (!duration) return null;

  // If it's a pure number, assume it's already seconds
  if (/^\d+$/.test(duration)) {
    return parseInt(duration, 10);
  }

  const regex = /^(\d+)\s*([a-zA-Z]+)$/;
  const match = duration.match(regex);

  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 's':
    case 'sec':
    case 'second':
    case 'seconds':
      return value;
    case 'm':
    case 'min':
    case 'minute':
    case 'minutes':
      return value * 60;
    case 'h':
    case 'hr':
    case 'hour':
    case 'hours':
      return value * 3600;
    case 'd':
    case 'day':
    case 'days':
      return value * 86400;
    case 'w':
    case 'week':
    case 'weeks':
      return value * 604800;
    default:
      return null;
  }
}

/**
 * Converts a duration or absolute timestamp string into an absolute Unix timestamp in seconds.
 * If the input is a duration (e.g., "1h"), it's added to the current time.
 * If the input is an absolute timestamp (e.g., > 1000000000), it's returned as is.
 */
export function resolveExpirationDate(input: string): string {
  const parsed = parseDurationToSeconds(input);
  if (parsed === null) return input; // Return as is, let SDK/Zod handle error if still invalid

  // If the parsed value is very large, it's likely already an absolute timestamp (seconds since 1970)
  // A value like 1,000,000,000 is ~Sep 2001. 
  // If it's smaller, it's likely a duration.
  // Current timestamp is ~1.7e9.
  if (parsed > 1000000000) {
    return parsed.toString();
  }

  const now = Math.floor(Date.now() / 1000);
  return (now + parsed).toString();
}
