"""Create a missing fixture, or read-only validate the approved synthetic seed."""
from pathlib import Path
import hashlib
import json
import sqlite3
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / '.cloud-data'
DATABASE = BASE / 'fixture.db'
MANIFEST = BASE / 'fixture-manifest.json'
EXPECTED_MANIFEST = [
    {'id': f'demo-page-{n:02}', 'number': f'{n:02}', 'source': 'synthetic-only'}
    for n in range(1, 11)
]
# Approved seed content from create-fixture.py; only creation/update times vary.
# Seed changes require explicit review and a corresponding digest update.
SEED_SHA256 = '8ec6b57547cc476e0be6d42538d26f2a73dc92a16c34c42992d7ed99e380d751'
TIMESTAMPS = {'created_at', 'updated_at', 'createdAt', 'updatedAt'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def prepare():
    paths = [DATABASE, MANIFEST, BASE / 'cache/npm']
    subprocess.run([
        'node', '-e',
        "const {dataPath}=require('./cloud/preflight.cjs');process.argv.slice(1).forEach(p=>dataPath(p));",
        *map(str, paths),
    ], cwd=ROOT, check=True)
    for candidate in paths:
        for part in [candidate, *candidate.parents]:
            require(not part.is_symlink(), 'Symlink in fixture/cache path')
    for suffix in ['-wal', '-shm', '-journal']:
        sidecar = Path(str(DATABASE) + suffix)
        require(not sidecar.exists() and not sidecar.is_symlink(),
                'Fixture has SQLite sidecars; stop the app and review before reuse')
    if MANIFEST.exists():
        require(json.loads(MANIFEST.read_text(encoding='utf-8')) == EXPECTED_MANIFEST,
                'Unrecognized synthetic manifest')
    reused = DATABASE.exists()
    if not reused:
        subprocess.run([sys.executable, str(ROOT / 'cloud/create-fixture.py')], check=True)
    require(DATABASE.is_file(), 'Fixture is not a regular file')
    require(MANIFEST.is_file(), 'Synthetic manifest is missing')
    require(json.loads(MANIFEST.read_text(encoding='utf-8')) == EXPECTED_MANIFEST,
            'Unrecognized synthetic manifest')
    # immutable=1 prevents SQLite from creating sidecars even while inspecting an
    # unknown file. Existing sidecars were rejected above, so none are ignored.
    with sqlite3.connect(DATABASE.as_uri() + '?mode=ro&immutable=1', uri=True) as db:
        db.execute('PRAGMA query_only=ON')
        require(db.execute('PRAGMA integrity_check').fetchall() == [('ok',)],
                'Fixture integrity check failed')
        with sqlite3.connect(':memory:') as reference:
            reference.executescript((ROOT / 'fixtures/effective-schema.sql').read_text(encoding='utf-8'))
            schema_query = "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_*'"
            require(set(db.execute(schema_query)) == set(reference.execute(schema_query)),
                    'Unrecognized fixture schema')
        require(not db.execute('PRAGMA foreign_key_check').fetchall(), 'Fixture foreign keys are invalid')
        require(db.execute('SELECT COUNT(*) FROM accounts').fetchone()[0] == 0,
                'Fixture must contain zero accounts')
        require(db.execute('SELECT COUNT(*) FROM model_providers').fetchone()[0] == 0,
                'Fixture must contain zero model providers')
        records = []
        for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name"):
            columns = [row[1] for row in db.execute(f'PRAGMA table_info("{table}")')
                       if row[1] not in TIMESTAMPS]
            names = ','.join('"' + name + '"' for name in columns)
            rows = db.execute(f'SELECT {names} FROM "{table}" ORDER BY {names}').fetchall()
            records.append([table, columns, rows])
        digest = hashlib.sha256(json.dumps(records, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
        require(digest == SEED_SHA256, 'Unrecognized synthetic identities or seed content')
    print(json.dumps({'action': 'reused' if reused else 'created', 'synthetic': True,
                      'database': str(DATABASE.relative_to(ROOT)), 'integrity': 'ok',
                      'accounts': 0, 'modelProviders': 0, 'seedSha256': digest}))


if __name__ == '__main__':
    try:
        prepare()
    except (OSError, ValueError, sqlite3.Error, subprocess.CalledProcessError) as error:
        print(f'Synthetic fixture refused: {error}', file=sys.stderr)
        sys.exit(1)
