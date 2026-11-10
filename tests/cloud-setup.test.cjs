'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { ROOT, dataPath } = require('../cloud/preflight.cjs');
const python = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

function workspace(t) {
  fs.mkdirSync(dataPath(), { recursive: true });
  const root = fs.mkdtempSync(dataPath(path.join(ROOT, '.cloud-data', 'setup-regression-')));
  for (const file of ['cloud/setup.sh', 'cloud/preflight.cjs', 'cloud/create-fixture.py',
    'cloud/ensure-fixture.py', 'fixtures/effective-schema.sql']) {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), destination);
  }
  const dir = path.join(root, '.cloud-data');
  fs.mkdirSync(dir);
  t.after(() => fs.rmSync(dataPath(root), { recursive: true }));
  return { root, dir, db: path.join(dir, 'fixture.db'), manifest: path.join(dir, 'fixture-manifest.json') };
}
function run(w, script = 'ensure-fixture.py') {
  return cp.spawnSync(python, [path.join(w.root, 'cloud', script)], { encoding: 'utf8' });
}
function seed(w) { const r = run(w); assert.equal(r.status, 0, r.stderr); }
function sql(w, statement) {
  cp.execFileSync(python, ['-c', 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.executescript(sys.argv[2]); c.commit(); c.close()', w.db, statement]);
}
function refusedUnchanged(w, check = () => run(w)) {
  const before = fs.readFileSync(w.db), files = fs.readdirSync(w.dir);
  const r = check();
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /Synthetic fixture refused/);
  assert.deepEqual(fs.readFileSync(w.db), before);
  assert.deepEqual(fs.readdirSync(w.dir), files);
  return r;
}

test('missing fixture is created; approved fixture is reused without changing DB or manifest', t => {
  const w = workspace(t); seed(w);
  const db = fs.readFileSync(w.db), manifest = fs.readFileSync(w.manifest);
  const r = run(w);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).action, 'reused');
  assert.deepEqual(fs.readFileSync(w.db), db);
  assert.deepEqual(fs.readFileSync(w.manifest), manifest);
  const creator = run(w, 'create-fixture.py');
  assert.equal(creator.status, 1);
  assert.match(creator.stderr, /Existing fixture retained/);
  assert.deepEqual(fs.readFileSync(w.db), db);
});

test('unknown database is refused before setup installs packages or creates caches', t => {
  const w = workspace(t); sql(w, 'CREATE TABLE unknown_test_only (id TEXT);');
  const r = refusedUnchanged(w, () => cp.spawnSync('bash', [path.join(w.root, 'cloud/setup.sh')], { encoding: 'utf8' }));
  assert.match(r.stderr, /manifest is missing/);
  assert.equal(fs.existsSync(path.join(w.root, 'backend-ts/node_modules')), false);
  assert.equal(fs.existsSync(path.join(w.dir, 'cache')), false);
});

for (const [label, statement, message] of [
  ['account', "INSERT INTO accounts (id,nickname,role,updated_at) VALUES ('unapproved-test-only','synthetic','publish',0)", /zero accounts/],
  ['provider', "INSERT INTO model_providers (id,name,provider,api_url,updated_at) VALUES ('unapproved-test-only','synthetic','custom','https://invalid.example',0)", /zero model providers/],
  ['changed content with demo IDs', "UPDATE wiki_pages SET content='unapproved synthetic test payload' WHERE id='demo-page-01'", /identities or seed content/],
  ['extra schema', 'CREATE TABLE sqliteXunknown_test_only (id TEXT)', /schema/],
]) {
  test('rejects ' + label + ' without overwriting or renaming', t => {
    const w = workspace(t); seed(w); sql(w, statement);
    assert.match(refusedUnchanged(w).stderr, message);
  });
}

test('missing or altered manifest cannot authorize an existing database', t => {
  const w = workspace(t); seed(w);
  fs.unlinkSync(w.manifest);
  assert.match(refusedUnchanged(w).stderr, /manifest is missing/);
  fs.writeFileSync(w.manifest, '[]');
  assert.match(refusedUnchanged(w).stderr, /manifest/);
});

test('corrupt database, SQLite sidecar and symlink are refused without modification', t => {
  const w = workspace(t); seed(w);
  fs.writeFileSync(w.db, 'synthetic corrupt SQLite test file');
  refusedUnchanged(w);
  fs.unlinkSync(w.db); seed(w);
  fs.writeFileSync(w.db + '-wal', 'synthetic sidecar');
  assert.match(refusedUnchanged(w).stderr, /sidecars/);
  fs.unlinkSync(w.db + '-wal');
  const target = path.join(w.dir, 'retained.db');
  fs.renameSync(w.db, target); fs.symlinkSync(target, w.db);
  refusedUnchanged(w);
  assert.equal(fs.lstatSync(w.db).isSymbolicLink(), true);
});
