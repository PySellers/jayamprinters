import type { JobCard } from '../types/jobCards';

/**
 * Plain string comparison of YYYY-MM-DD dates avoids Date-object timezone mismatches
 * (delivery_date has no time zone; parsing it as a Date and comparing against a local
 * "today" can misfire by hours near midnight).
 */
export function isOverdue(jobCard: JobCard): boolean {
  if (!jobCard.delivery_date || jobCard.status === 'delivered') return false;
  const todayStr = new Date().toISOString().slice(0, 10);
  return jobCard.delivery_date < todayStr;
}
