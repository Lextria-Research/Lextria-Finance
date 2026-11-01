// src/lib/clock.ts
// Standardized clock for financial dates, ISO conversion, and office dispatches

const TIMEZONE = 'Asia/Kolkata';

export const clock = {
  now(): Date {
    return new Date();
  },

  nowISO(): string {
    return new Date().toISOString();
  },

  todayISO(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(this.now());
    return parts; // en-CA outputs YYYY-MM-DD
  },

  todayYMD(): string {
    return this.todayISO();
  },

  todayDisplay(): string {
    return this.formatDisplay(this.todayISO());
  },

  formatDisplay(dateStr?: string | null): string {
    if (!dateStr) return '—';
    try {
      const parts = dateStr.slice(0, 10).split('-');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    } catch {
      // fallback
    }
    return dateStr;
  },

  parseDisplayToISO(displayDate: string): string | null {
    if (!displayDate) return null;
    const parts = displayDate.trim().split(/[-/]/);
    if (parts.length === 3) {
      const [d, m, y] = parts;
      if (d.length <= 2 && m.length <= 2 && y.length === 4) {
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    return null;
  },

  currentYearMonth(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
    }).format(this.now());
    return parts.slice(0, 7); // YYYY-MM
  },

  daysAgo(isoDateString: string): number {
    const today = new Date(this.todayISO());
    const target = new Date(isoDateString.slice(0, 10));
    const diffMs = today.getTime() - target.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  },

  daysDifference(targetDate: string): number {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  },
};

export const formatDate = (dateStr?: string | null): string => clock.formatDisplay(dateStr);
export const todayDateStr = (): string => clock.todayYMD();
