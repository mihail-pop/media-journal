"""Bounded-memory JSON reading and disposable, disk-backed restore bookkeeping."""

import io
import json
import os
import pickle
import sqlite3
import tempfile
from pathlib import Path


def iter_json_records(stream, check_cancelled=None):
    """Stream the existing array of record objects, bounded by one record.

    Frame each object before decoding it. Invalid syntax inside an early object
    must fail there, rather than buffering the rest of a large archive while
    waiting for JSONDecoder to accept it.
    """
    reader = io.TextIOWrapper(stream, encoding='utf-8-sig')
    buffer = ''
    position = 0
    eof = False

    def fill():
        nonlocal buffer, position, eof
        if position >= len(buffer) and not eof:
            if check_cancelled is not None:
                check_cancelled()
            buffer = reader.read(65536)
            position = 0
            eof = not buffer

    def whitespace():
        nonlocal position
        while True:
            fill()
            while position < len(buffer) and buffer[position] in ' \t\r\n':
                position += 1
            if position < len(buffer) or eof:
                return

    def object_text():
        nonlocal position
        parts = []
        depth = 0
        quoted = False
        escaped = False
        while True:
            fill()
            if eof:
                raise ValueError('Incomplete backup database record.')
            start = position
            while position < len(buffer):
                char = buffer[position]
                position += 1
                if quoted:
                    if escaped:
                        escaped = False
                    elif char == '\\':
                        escaped = True
                    elif char == '"':
                        quoted = False
                elif char == '"':
                    quoted = True
                elif char in '{[':
                    depth += 1
                elif char in '}]':
                    depth -= 1
                    if depth == 0:
                        parts.append(buffer[start:position])
                        return ''.join(parts)
            parts.append(buffer[start:position])

    try:
        whitespace()
        if position >= len(buffer) or buffer[position] != '[':
            raise ValueError('Invalid backup database data: expected a JSON array.')
        position += 1
        allow_end = True
        while True:
            whitespace()
            if position >= len(buffer):
                raise ValueError('Incomplete backup database data.')
            if buffer[position] == ']':
                if not allow_end:
                    raise ValueError('Invalid trailing comma in backup database data.')
                position += 1
                whitespace()
                if position != len(buffer):
                    raise ValueError('Unexpected data after the backup database array.')
                return
            if buffer[position] != '{':
                raise ValueError('Invalid backup database record: expected an object.')
            try:
                record = json.loads(object_text())
            except json.JSONDecodeError as error:
                raise ValueError('Invalid backup database record.') from error
            whitespace()
            if position >= len(buffer) or buffer[position] not in ',]':
                raise ValueError('Missing JSON separator in backup database data.')
            yield record
            if buffer[position] == ',':
                position += 1
                allow_end = False
            else:
                allow_end = True
    finally:
        reader.detach()


def _key(value):
    # These typed keys/values are generated here from validated records and ORM
    # values. No pickle bytes are ever accepted from the backup archive.
    return pickle.dumps(value, protocol=4)


class RecordStore:
    """Keep restore records, ID mappings and child-match snapshots on disk."""

    def __init__(self, directory, check_cancelled=None):
        descriptor, name = tempfile.mkstemp(prefix='records-', suffix='.sqlite3', dir=directory)
        os.close(descriptor)
        self.path = Path(name)
        self._db = None
        self._count = 0
        self._operations = 0
        self._cancel = check_cancelled or (lambda: None)
        try:
            self._db = sqlite3.connect(name)
            self._db.execute('PRAGMA journal_mode=OFF')
            self._db.execute('PRAGMA synchronous=OFF')
            self._db.execute('PRAGMA cache_size=-2048')
            self._db.execute('PRAGMA temp_store=FILE')
            self._db.execute('PRAGMA mmap_size=0')
            self._db.executescript('''
                CREATE TABLE records (
                    sequence INTEGER PRIMARY KEY,
                    model TEXT NOT NULL,
                    identity TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    UNIQUE (model, identity)
                );
                CREATE INDEX records_model ON records (model, sequence);
                CREATE TABLE mappings (
                    model TEXT NOT NULL,
                    old_id BLOB NOT NULL,
                    new_id BLOB NOT NULL,
                    PRIMARY KEY (model, old_id)
                ) WITHOUT ROWID;
                CREATE TABLE used (
                    model TEXT NOT NULL,
                    identity BLOB NOT NULL,
                    PRIMARY KEY (model, identity)
                ) WITHOUT ROWID;
                CREATE TABLE candidate_sets (
                    model TEXT NOT NULL,
                    fields BLOB NOT NULL,
                    PRIMARY KEY (model, fields)
                ) WITHOUT ROWID;
                CREATE TABLE candidates (
                    sequence INTEGER PRIMARY KEY,
                    model TEXT NOT NULL,
                    fields BLOB NOT NULL,
                    identity BLOB NOT NULL,
                    object_id BLOB NOT NULL
                );
                CREATE INDEX candidate_lookup ON candidates (model, fields, identity, sequence);
            ''')
        except Exception:
            self.close()
            raise

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()

    def close(self):
        if self._db is not None:
            self._db.close()
            self._db = None
        try:
            self.path.unlink(missing_ok=True)
        except OSError:
            # The caller also removes the staging directory. Cleanup must not
            # turn an already committed restore into a reported failure.
            pass

    def _tick(self):
        self._operations += 1
        if self._operations % 500 == 0:
            self._cancel()
            self._db.commit()

    def add(self, record):
        try:
            self._db.execute(
                'INSERT INTO records (model, identity, payload) VALUES (?, ?, ?)',
                (record['model'], str(record['pk']), json.dumps(record, separators=(',', ':'))),
            )
        except sqlite3.IntegrityError as error:
            raise ValueError(f"Duplicate backup record: {(record['model'], record['pk'])}") from error
        self._count += 1
        self._tick()

    def __len__(self):
        return self._count

    def _records(self, model=None):
        if model is None:
            cursor = self._db.execute('SELECT payload FROM records ORDER BY sequence')
        else:
            cursor = self._db.execute('SELECT payload FROM records WHERE model=? ORDER BY sequence', (model,))
        try:
            for (payload,) in cursor:
                self._tick()
                yield json.loads(payload)
        finally:
            cursor.close()

    def __iter__(self):
        return self._records()

    def iter_model(self, model):
        return self._records(model)

    def transform(self, callback):
        cursor = self._db.execute('SELECT sequence, payload FROM records ORDER BY sequence')
        try:
            for sequence, payload in cursor:
                record = json.loads(payload)
                replacement = callback(record)
                if replacement is not None:
                    record = replacement
                self._db.execute('UPDATE records SET payload=? WHERE sequence=?',
                                 (json.dumps(record, separators=(',', ':')), sequence))
                self._tick()
        finally:
            cursor.close()

    def set_mapping(self, model, old_id, new_id):
        self._db.execute('INSERT OR REPLACE INTO mappings (model, old_id, new_id) VALUES (?, ?, ?)',
                         (model, _key(old_id), _key(new_id)))
        self._tick()

    def get_mapping(self, model, old_id):
        row = self._db.execute('SELECT new_id FROM mappings WHERE model=? AND old_id=?',
                               (model, _key(old_id))).fetchone()
        if row is None:
            raise KeyError((model, old_id))
        return pickle.loads(row[0])

    def mark_used(self, model, identity):
        self._db.execute('INSERT OR IGNORE INTO used (model, identity) VALUES (?, ?)', (model, _key(identity)))
        self._tick()

    def is_used(self, model, identity):
        return self._db.execute('SELECT 1 FROM used WHERE model=? AND identity=?',
                                (model, _key(identity))).fetchone() is not None

    def ensure_candidates(self, model, fields, rows):
        fields = _key(tuple(fields))
        if self._db.execute('SELECT 1 FROM candidate_sets WHERE model=? AND fields=?', (model, fields)).fetchone():
            return
        for row in rows:
            self._db.execute('INSERT INTO candidates (model, fields, identity, object_id) VALUES (?, ?, ?, ?)',
                             (model, fields, _key(tuple(row[1:])), _key(row[0])))
            self._tick()
        self._db.execute('INSERT INTO candidate_sets (model, fields) VALUES (?, ?)', (model, fields))
        self._tick()

    def pop_candidate(self, model, fields, identity):
        lookup = (model, _key(tuple(fields)), _key(tuple(identity)))
        while True:
            row = self._db.execute('SELECT sequence, object_id FROM candidates '
                                   'WHERE model=? AND fields=? AND identity=? ORDER BY sequence LIMIT 1', lookup).fetchone()
            if row is None:
                return None
            self._db.execute('DELETE FROM candidates WHERE sequence=?', (row[0],))
            self._tick()
            identity = pickle.loads(row[1])
            if not self.is_used(model, identity):
                return identity
