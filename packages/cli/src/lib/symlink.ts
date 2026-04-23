import { lstatSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs';

function readExistingSymlinkTarget(linkPath: string): string | null {
  try {
    const stat = lstatSync(linkPath);
    if (!stat.isSymbolicLink()) return null;
    return readlinkSync(linkPath);
  } catch {
    return null;
  }
}

function pathExists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

export function assertCanLinkSkill(
  canonicalDir: string,
  linkPath: string,
  force: boolean,
): void {
  const existingTarget = readExistingSymlinkTarget(linkPath);
  if (existingTarget === canonicalDir) return;
  if (existingTarget !== null) {
    if (!force) {
      throw new Error(
        `symlink at ${linkPath} points elsewhere (${existingTarget}); pass --force to replace`,
      );
    }
    return;
  }
  if (pathExists(linkPath)) {
    throw new Error(
      `${linkPath} exists and is not a symlink; remove it manually then retry`,
    );
  }
}

export function ensureSkillSymlink(
  canonicalDir: string,
  linkPath: string,
  force: boolean,
): void {
  assertCanLinkSkill(canonicalDir, linkPath, force);
  const existingTarget = readExistingSymlinkTarget(linkPath);
  if (existingTarget === canonicalDir) return;
  if (existingTarget !== null) {
    unlinkSync(linkPath);
  }
  symlinkSync(canonicalDir, linkPath, 'junction');
}

export function removeSkillSymlinkIfOurs(
  canonicalDir: string,
  linkPath: string,
): void {
  const existingTarget = readExistingSymlinkTarget(linkPath);
  if (existingTarget === canonicalDir) {
    unlinkSync(linkPath);
  }
}
