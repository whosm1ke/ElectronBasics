// env-utils.ts — converts a snippet's ordered {key,value} env list (the shape
// the editor UI and storage use) into a plain object (the shape execFile's
// `env` option and Object spread want). Shared by ipc.ts and scheduler.ts.
import type { EnvVar } from '@shared/types';

export function envListToObject(envList: EnvVar[] | null | undefined): Record<string, string> | null {
  if (!Array.isArray(envList)) return null;
  const obj: Record<string, string> = {};
  envList.forEach(({ key, value }) => {
    if (key) obj[key] = value ?? '';
  });
  return Object.keys(obj).length ? obj : null;
}
