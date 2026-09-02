#!/usr/bin/env node
/**
 * Copies the shared packages the backend needs (core, allocation-engine)
 * from packages/*\/src into apps/backend/src/vendor/*, rewriting their
 * @exam-allocator/* cross-package imports into relative paths as it goes,
 * then does the same for apps/backend's own hand-written files.
 *
 * This exists so apps/backend is a fully self-contained folder for hosting
 * - `cd apps/backend && npm install && npm start` works with zero knowledge
 * of the monorepo/workspaces above it (verified: copying just that folder
 * to a clean location and running it there works). The frontend keeps using
 * the originals in packages/ directly; nothing here affects it.
 *
 * Run this again any time you change packages/core or
 * packages/allocation-engine and want that fix reflected in the backend's
 * copy. It's idempotent - safe to run repeatedly.
 *
 * Usage: node scripts/sync-backend-vendor.mjs   (run from repo root)
 */
import { join } from 'node:path';
import { syncVendoredPackages, rewriteConsumerFiles, findFilesWithSpecifier } from './lib/vendorSync.mjs';

const ROOT = process.cwd();
const APP_SRC = join(ROOT, 'apps/backend/src');
const VENDOR_ROOT = join(APP_SRC, 'vendor');

// Only the packages the frontend ALSO needs get copied here - the two that
// are backend-exclusive (memory-repositories, googlesheets-repositories)
// were moved permanently into apps/backend/src/vendor and no longer exist
// under packages/, so this list intentionally does not include them.
await syncVendoredPackages(VENDOR_ROOT, [
  { name: 'core', srcDir: join(ROOT, 'packages/core/src') },
  { name: 'allocation-engine', srcDir: join(ROOT, 'packages/allocation-engine/src'), exclude: ['__tests__'] },
]);

const consumerFiles = await findFilesWithSpecifier(APP_SRC, ['vendor']);
await rewriteConsumerFiles(consumerFiles, VENDOR_ROOT);

console.log('\nDone. Typecheck with: npm run build --workspace=apps/backend');
