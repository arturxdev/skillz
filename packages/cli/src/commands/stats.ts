// Sprint 3: GET /stats?skill=&since=&by=, render with cli-table3.

export async function statsCommand(_opts: {
  skill?: string;
  last: string;
  by?: 'project' | 'device' | 'version';
}): Promise<void> {
  console.log('TODO: stats');
}
