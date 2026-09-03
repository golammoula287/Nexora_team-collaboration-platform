/**
 * The database half of `pnpm env:check`, run as a separate process.
 *
 * Why separate: on Windows, Node 24 aborts with
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` while tearing down
 * the Neon HTTP driver's sockets - after the queries have succeeded. No exit
 * path avoids it (process.exit, process.exitCode and process.reallyExit all
 * abort the same way), so the crash is contained here instead: the parent
 * reads the lines below and never loads the driver itself.
 *
 * Communicates over stdout, one `KIND<TAB>MESSAGE` line per finding.
 */
import { neon } from '@neondatabase/serverless';

const url = process.argv[2];
const emit = (kind, message) => process.stdout.write(`${kind}\t${message}\n`);

try {
  const sql = neon(url);

  const [version] = await sql`select version()`;
  emit('ok', `connected: ${String(version.version).split(',')[0]}`);

  const extensions = await sql`
    select name, installed_version
    from pg_available_extensions
    where name in ('vector', 'pg_trgm')
    order by name
  `;

  if (extensions.length === 0) {
    emit('bad', 'neither vector nor pg_trgm is available on this database');
    emit('note', 'Nexora needs pgvector. Neon has it built in; other hosts may not.');
  }
  for (const ext of extensions) {
    if (ext.installed_version) emit('ok', `extension ${ext.name} installed (${ext.installed_version})`);
    else emit('warn', `extension ${ext.name} available but not installed - the migration installs it`);
  }

  const [applied] = await sql`
    select count(*)::int as n
    from information_schema.tables
    where table_schema = 'public' and table_name = 'tasks'
  `;

  if (applied.n > 0) {
    const [tables] = await sql`
      select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `;
    const [policies] = await sql`select count(*)::int as n from pg_policies where schemaname = 'public'`;
    emit('ok', `migrations applied: ${tables.n} tables, ${policies.n} RLS policies`);

    const [org] = await sql`select count(*)::int as n from organization`;
    if (org.n > 0) emit('ok', `seeded: ${org.n} organization(s)`);
    else emit('warn', 'no data yet - run: pnpm db:seed');
  } else {
    emit('warn', 'migrations not applied yet - run: pnpm db:migrate && pnpm db:seed');
  }

  emit('done', 'ok');
} catch (error) {
  emit('bad', `could not connect: ${error instanceof Error ? error.message : String(error)}`);
  emit('note', 'Check the connection string, and that the Neon project is not suspended.');
  emit('done', 'failed');
}
