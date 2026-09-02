#!/usr/bin/env node
/**
 * Same idea as sync-backend-vendor.mjs, for the frontend: copies core and
 * allocation-engine from packages/*\/src into apps/frontend/src/vendor/*,
 * rewrites @exam-allocator/* imports (including in apps/frontend's own
 * .tsx pages/components) into relative paths, so apps/frontend is a fully
 * self-contained folder - no workspace/monorepo needed to install or build it.
 *
 * indexeddb-repositories is frontend-exclusive and was moved permanently
 * into apps/frontend/src/vendor (no longer exists under packages/), so it's
 * not part of this repeatable sync - same pattern as the backend's
 * memory-repositories/googlesheets-repositories.
 *
 * Run again any time packages/core or packages/allocation-engine changes.
 * Idempotent - safe to run repeatedly.
 *
 * Usage: node scripts/sync-frontend-vendor.mjs   (run from repo root)
 */
import { join } from 'node:path';
import { syncVendoredPackages, rewriteConsumerFiles, findFilesWithSpecifier } from './lib/vendorSync.mjs';

const ROOT = process.cwd();
const APP_SRC = join(ROOT, 'apps/frontend/src');
const VENDOR_ROOT = join(APP_SRC, 'vendor');

await syncVendoredPackages(VENDOR_ROOT, [
  { name: 'core', srcDir: join(ROOT, 'packages/core/src') },
  { name: 'allocation-engine', srcDir: join(ROOT, 'packages/allocation-engine/src'), exclude: ['__tests__'] },
]);

const consumerFiles = await findFilesWithSpecifier(APP_SRC, ['vendor']);
await rewriteConsumerFiles(consumerFiles, VENDOR_ROOT);

console.log('\nDone. Typecheck with: npm run build --workspace=apps/frontend');
