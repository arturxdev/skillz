// Sprint 2: if no target, Clack multiselect from GET /skills + select scope.
// Download via GET /skills/download/:key (proxy), verify sha256, extract,
// inject telemetry block in SKILL.md, upsert SQLite, POST /installations.

export async function installCommand(_opts: {
  target?: string;
  scope?: 'global' | 'project';
  force?: boolean;
}): Promise<void> {
  console.log('TODO: install');
}
