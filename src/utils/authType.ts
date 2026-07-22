export function normalizeAuthType(type: unknown): string {
  return String(type || '').toLowerCase().replace(/_/g, '-')
}
