/**
 * Postinstall: create a uv-managed venv for the sibling taggly repo.
 * Skips silently if taggly is not found, venv already exists, or uv is unavailable.
 */
const { execSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

const taggly_dir = path.resolve(__dirname, '..', '..', 'taggly');
const venv_dir = path.join(taggly_dir, '.venv');

if (!existsSync(taggly_dir)) {
  console.log(`[setup-taggly] taggly not found at ${taggly_dir} — skipping`);
  process.exit(0);
}

if (existsSync(venv_dir)) {
  console.log(`[setup-taggly] venv already exists at ${venv_dir}`);
  process.exit(0);
}

try {
  execSync('uv --version', { stdio: 'ignore' });
} catch {
  console.log(`[setup-taggly] uv not found — skipping venv setup`);
  console.log(`[setup-taggly] to set up manually: cd ${taggly_dir} && uv sync`);
  process.exit(0);
}

console.log(`[setup-taggly] creating taggly venv (this may take a while)...`);
try {
  execSync('uv sync', { cwd: taggly_dir, stdio: 'inherit' });
  console.log(`[setup-taggly] done — venv ready at ${venv_dir}`);
} catch {
  console.error(`[setup-taggly] venv setup failed — run manually: cd ${taggly_dir} && uv sync`);
}
