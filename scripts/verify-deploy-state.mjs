/**
 * Checks whether a checkout contains every deployment fix from 2026-09-07/08.
 *
 *   node scripts/verify-deploy-state.mjs
 *
 * Zero dependencies, plain Node — runs in any clone without `npm install`.
 * Run it in the repository you actually deploy from. Every line must say ok.
 *
 * Each check names the symptom you get in production when it fails, so a FAIL
 * is a diagnosis rather than a puzzle.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = 0;

function read(rel) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8');
  } catch {
    return null;
  }
}

/**
 * Strips comments before matching.
 *
 * Without this, every check that forbids a pattern trips over the comment that
 * explains why the pattern is forbidden — the files deliberately quote
 * `export default` and `status === 404` in prose. The `[^:]` guard keeps
 * `https://` intact.
 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** @param {{file:string, must?:RegExp[], mustNot?:RegExp[], why:string, symptom:string}} spec */
function check(label, spec) {
  const raw = read(spec.file);
  if (raw === null) {
    console.log(`FAIL  ${label}\n        ${spec.file} does not exist\n        symptom: ${spec.symptom}`);
    failed++;
    return;
  }
  const text = stripComments(raw);
  const missing = (spec.must ?? []).filter((re) => !re.test(text));
  const present = (spec.mustNot ?? []).filter((re) => re.test(text));

  if (missing.length === 0 && present.length === 0) {
    console.log(`ok    ${label}`);
    return;
  }
  failed++;
  console.log(`FAIL  ${label}`);
  console.log(`        file: ${spec.file}`);
  for (const re of missing) console.log(`        missing: ${re}`);
  for (const re of present) console.log(`        should NOT contain: ${re}`);
  console.log(`        why: ${spec.why}`);
  console.log(`        symptom if unfixed: ${spec.symptom}`);
}

console.log(`\nVerifying deployment fixes in: ${root}\n`);

// ---------------------------------------------------------------- 1. ESM extensions
const API_ENTRY = 'api/[[...route]].ts';
check('1. API entry imports server/app WITH a .js extension', {
  file: API_ENTRY,
  must: [/from\s+['"]\.\.\/server\/app\.js['"]/],
  mustNot: [/from\s+['"]\.\.\/server\/app['"]/],
  why: "Node's ESM loader does no extension resolution, and TypeScript never rewrites specifiers.",
  symptom: 'every /api/* route 500s with ERR_MODULE_NOT_FOUND: Cannot find module /var/task/server/app',
});

// ---------------------------------------------------------- 2. handler signature
check('2. API entry exports named HTTP methods and NO default export', {
  file: API_ENTRY,
  must: [/handler as GET/, /handler as POST/, /handler as DELETE/],
  mustNot: [/export\s+default/],
  why: 'export default selects Vercel\'s legacy (req,res)=>void signature, which discards a returned Response.',
  symptom: 'every /api/* route hangs to a 504 after 300s, logging "default export returned a `Response`"',
});

// -------------------------------------------------------------- 3. SPA rewrite
check('3. vercel.json SPA rewrite uses /(.*) with no negative lookahead', {
  file: 'vercel.json',
  must: [/"source":\s*"\/\(\.\*\)"/],
  mustNot: [/\?!api/],
  why: "Vercel's rewrite source is path-to-regexp, not raw regex; a lookahead silently matches nothing. /api is already safe because the filesystem (including api/ functions) resolves before rewrites.",
  symptom: "Vercel's \"The page could not be found\" on /admin, /all-cars, /car/... while / works",
});

// ------------------------------------------------------- 4. build-time env guard
check('4. vite.config.ts fails the build without VITE_CLOUDINARY_CLOUD_NAME', {
  file: 'vite.config.ts',
  must: [/requireCloudinaryCloudName/, /loadEnv/],
  why: 'VITE_ vars are inlined at build time; a build without it ships a site whose every image URL is an empty string.',
  symptom: 'no images anywhere, zero requests to res.cloudinary.com, one console error',
});

// ------------------------------------------------------ 5. error classification
check('5. api.ts exports isNotFoundError (code-based, not status-based)', {
  file: 'src/lib/api.ts',
  must: [/export function isNotFoundError/],
  why: 'A bare 404 can come from infrastructure, not our API.',
  symptom: 'a misrouted /api path is reported to the customer as "Car Not Found", hiding a routing fault',
});

for (const f of ['src/pages/CarDetailsPage.tsx', 'src/pages/BookingPage.tsx']) {
  check(`6. ${path.basename(f)} uses isNotFoundError, not status === 404`, {
    file: f,
    must: [/isNotFoundError\(/],
    mustNot: [/status === 404/],
    why: 'Same reason as check 5.',
    symptom: 'infrastructure 404s shown as "Car Not Found"',
  });
}

// --------------------------------------------------------------- 7. retry policy
check('7. main.tsx does not retry 4xx / non-JSON responses', {
  file: 'src/main.tsx',
  must: [/retry:\s*\(/, /invalid_response/],
  mustNot: [/retry:\s*2\s*,/],
  why: 'A blanket retry:2 re-requests answers that are already final; the query stays isPending throughout.',
  symptom: 'a stale car link shows a skeleton for ~3s before any error appears',
});

// ------------------------------------------------ 8. no extensionless imports left
console.log('\n8. Sweep: extensionless relative imports in api/ server/ db/');
const OFFENDER =
  /(?:from|import\()\s*['"](\.\.?\/[^'"]*)['"]/g;
let sweepBad = 0;
function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      walk(rel);
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.mts')) {
      const text = stripComments(read(rel) ?? '');
      for (const m of text.matchAll(OFFENDER)) {
        const spec = m[1];
        if (!/\.(js|json|css)$/.test(spec)) {
          console.log(`      FAIL  ${rel}  ->  ${spec}   (needs a .js extension)`);
          sweepBad++;
        }
      }
    }
  }
}
for (const d of ['api', 'server', 'db']) walk(d);
if (sweepBad === 0) {
  console.log('      ok    every relative import carries an extension');
} else {
  failed += sweepBad;
}

// ------------------------------------------------------------------------ verdict
console.log(
  failed === 0
    ? '\nRESULT: PASS — this checkout has every deployment fix.\n'
    : `\nRESULT: FAIL — ${failed} problem(s). This checkout is missing fixes; that is why the deployed site is unchanged.\n`,
);
process.exit(failed === 0 ? 0 : 1);
