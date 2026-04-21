// Sprint 1: interactive (Clack text) if no email, POST /auth/request-code,
// prompt for code (Clack text), POST /auth/verify-code, persist token to
// ~/.config/skillz/config.json with chmod 0600.

export async function linkCommand(_opts: { email?: string }): Promise<void> {
  console.log('TODO: link');
}
