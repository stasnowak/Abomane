import { rmSync } from 'node:fs';

/** Starts every run from an empty database so assertions are deterministic. */
export default function globalSetup(): void {
  rmSync('./e2e/.data', { recursive: true, force: true });
}
