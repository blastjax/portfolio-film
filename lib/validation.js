// 'YYYY' or 'YYYY-MM' (a plain 4-digit year, optionally a hyphenated month 01-12)
const DATE_PATTERN = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

export function validatePhotoDate(raw) {
  const value = (raw || '').trim();
  if (!value) return { ok: true, value: null };
  if (!DATE_PATTERN.test(value)) {
    return { ok: false, error: 'Date must be a year (e.g. 2024) or year-month (e.g. 2024-07).' };
  }
  return { ok: true, value };
}
