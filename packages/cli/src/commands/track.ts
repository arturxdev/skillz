// HOT PATH. Rules:
// - Exit 0 always (even on error).
// - Never stdout.
// - No @clack/prompts, no banner, no update-checker.
// - Fetch timeout 2s → fallback to pending_pings queue in SQLite.
// Sprint 3 fills the body.

export async function trackCommand(_args: string[]): Promise<void> {
  // stub
}
