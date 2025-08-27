/**
 * Timezone utility functions for handling Korean timezone (Asia/Seoul)
 */

export const KOREA_TIMEZONE = 'Asia/Seoul';

/**
 * Get current date/time in Korea timezone
 */
export function getKoreaTime(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: KOREA_TIMEZONE }));
}

/**
 * Get start of today in Korea timezone as ISO string
 */
export function getTodayStartKorea(): string {
  const koreaTime = getKoreaTime();
  const todayStart = new Date(koreaTime.getFullYear(), koreaTime.getMonth(), koreaTime.getDate(), 0, 0, 0);
  return todayStart.toISOString();
}

/**
 * Get end of today in Korea timezone as ISO string
 */
export function getTodayEndKorea(): string {
  const koreaTime = getKoreaTime();
  const todayEnd = new Date(koreaTime.getFullYear(), koreaTime.getMonth(), koreaTime.getDate(), 23, 59, 59);
  return todayEnd.toISOString();
}

/**
 * Get start of a specific date in Korea timezone
 */
export function getDayStartKorea(date: Date): Date {
  const koreaTime = new Date(date.toLocaleString("en-US", { timeZone: KOREA_TIMEZONE }));
  return new Date(koreaTime.getFullYear(), koreaTime.getMonth(), koreaTime.getDate(), 0, 0, 0);
}

/**
 * Get end of a specific date in Korea timezone
 */
export function getDayEndKorea(date: Date): Date {
  const koreaTime = new Date(date.toLocaleString("en-US", { timeZone: KOREA_TIMEZONE }));
  return new Date(koreaTime.getFullYear(), koreaTime.getMonth(), koreaTime.getDate(), 23, 59, 59);
}

/**
 * Format date for Korea timezone display
 */
export function formatKoreaDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('ko-KR', { 
    timeZone: KOREA_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Format date for Korea timezone display (date only)
 */
export function formatKoreaDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('ko-KR', { 
    timeZone: KOREA_TIMEZONE,
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format time for Korea timezone display (time only)
 */
export function formatKoreaTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleTimeString('ko-KR', { 
    timeZone: KOREA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}