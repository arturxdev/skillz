import { VERSION } from '../lib/constants';
import { checkForUpdate } from '../lib/update-checker';

export async function versionCommand(): Promise<void> {
  console.log(`skillz ${VERSION}`);
  const info = await checkForUpdate(true);
  if (!info) return;
  if (info.hasUpdate) {
    console.log(`↑ v${info.latest} available — run \`skillz self-update\``);
  } else {
    console.log('Up to date.');
  }
}
