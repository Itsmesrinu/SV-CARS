
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

/**
 * Fail the production build when `VITE_CLOUDINARY_CLOUD_NAME` is missing.
 *
 * `VITE_`-prefixed variables are inlined into the bundle at build time, not read
 * at runtime. Without this guard a build with the variable absent succeeds
 * cheerfully and ships a site where `cldUrl()` returns `''` for every image, so
 * every `<img>` gets `src=""` and not one picture renders.
 *
 * Failing the build is strictly better: Vercel keeps the previous working
 * deployment live when a build fails, whereas a "successful" image-less build
 * replaces a working site with a broken one.
 *
 * Dev is exempt — `vite dev` should start even with no `.env`.
 */
function requireCloudinaryCloudName(mode: string): void {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if ((env.VITE_CLOUDINARY_CLOUD_NAME ?? '').trim() !== '') return;

  throw new Error(
    [
      '',
      'Build aborted: VITE_CLOUDINARY_CLOUD_NAME is not set.',
      '',
      'This value is compiled into the bundle, so a build without it produces a',
      'site with NO images at all — every image URL becomes an empty string.',
      '',
      'Local:  add VITE_CLOUDINARY_CLOUD_NAME to .env.local (or .env). See .env.example.',
      'Vercel: Project Settings -> Environment Variables. Set it for Production AND',
      '        Preview, then redeploy. Editing it alone does nothing until a rebuild,',
      '        and a preview deployment does not inherit Production-scoped variables.',
      '',
      'It is the same value as CLOUDINARY_CLOUD_NAME and is public by design — it',
      'appears in every image URL on the live site.',
      '',
    ].join('\n'),
  );
}

export default defineConfig(({command, mode}) => {
  if (command === 'build') requireCloudinaryCloudName(mode);

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Vercel functions cannot run under plain `vite dev`, so the same Hono app
      // is served by scripts/dev-server.ts on 3001 and proxied here. Keeping the
      // API same-origin in dev is what makes the httpOnly session cookie behave
      // locally exactly as it does in production (CONTRACT.md §13).
      proxy: {
        '/api': { target: 'http://localhost:3001', changeOrigin: true },
      },
    },
  };
});
