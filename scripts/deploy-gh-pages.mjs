// Deploy de dist/ a la rama gh-pages usando git worktree.
//
// Por qué worktree y no `git checkout gh-pages`:
//   - No requiere stashear cambios en main.
//   - Imposibilita olvidarse de volver a main al final.
//   - El worktree temporal queda fuera del árbol normal, sin contaminar la
//     vista del editor.
//
// Flujo:
//   1. Validar que dist/ existe (sino, abortar).
//   2. Limpiar worktree previo si quedó por un deploy roto.
//   3. Crear worktree en .gh-pages-deploy apuntando a gh-pages.
//   4. Borrar todo el contenido del worktree (excepto .git).
//   5. Copiar dist/ al worktree.
//   6. git add -A → commit → push si hay cambios.
//   7. Eliminar el worktree.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const WORKTREE = '.gh-pages-deploy';
const BRANCH = 'gh-pages';

function run(cmd, opts = {}) {
  console.log(`$ ${cmd}${opts.cwd ? `   (cwd: ${opts.cwd})` : ''}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function tryRun(cmd, opts = {}) {
  try {
    run(cmd, opts);
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(DIST)) {
  console.error(`No existe ${DIST}/. Corré "npm run build" primero.`);
  process.exit(1);
}

// Limpieza defensiva por si un deploy anterior dejó el worktree colgando.
if (existsSync(WORKTREE)) {
  tryRun(`git worktree remove --force ${WORKTREE}`);
  if (existsSync(WORKTREE)) rmSync(WORKTREE, { recursive: true, force: true });
}

run(`git fetch origin ${BRANCH}`);
run(`git worktree add ${WORKTREE} ${BRANCH}`);

try {
  for (const entry of readdirSync(WORKTREE)) {
    if (entry === '.git') continue;
    rmSync(join(WORKTREE, entry), { recursive: true, force: true });
  }

  for (const entry of readdirSync(DIST)) {
    cpSync(join(DIST, entry), join(WORKTREE, entry), { recursive: true });
  }

  run('git add -A', { cwd: WORKTREE });

  const status = execSync('git status --porcelain', { cwd: WORKTREE }).toString().trim();
  if (!status) {
    console.log('No hay cambios para desplegar.');
  } else {
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
    run(`git commit -m "Deploy ${stamp}"`, { cwd: WORKTREE });
    run(`git push origin ${BRANCH}`, { cwd: WORKTREE });
    console.log(`\nDeploy publicado a ${BRANCH}.`);
  }
} finally {
  tryRun(`git worktree remove --force ${WORKTREE}`);
}
