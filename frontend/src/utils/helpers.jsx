export function formatDateISO(d = new Date()) {
  return new Date(d).toISOString().split('T')[0];
}