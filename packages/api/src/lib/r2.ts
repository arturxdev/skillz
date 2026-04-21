export function skillBundleKey(skillId: string, version: number): string {
  return `skills/${skillId}/${version}/bundle.tar.gz`;
}

export async function putSkillBundle(
  env: Env,
  skillId: string,
  version: number,
  body: ArrayBuffer,
  hash: string,
): Promise<string> {
  const key = skillBundleKey(skillId, version);
  await env.R2_BUCKET.put(key, body, {
    httpMetadata: { contentType: 'application/gzip' },
    customMetadata: { hash, size: String(body.byteLength) },
  });
  return key;
}

export async function getSkillBundle(env: Env, key: string): Promise<R2ObjectBody | null> {
  return env.R2_BUCKET.get(key);
}
