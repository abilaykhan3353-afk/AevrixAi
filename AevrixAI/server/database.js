const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
async function migrate(db,{allowLegacy=false}={}) {
  const exists=(await db.query("SELECT to_regclass('public.messages') AS name")).rows[0].name;
  if(exists){const columns=(await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='messages' AND column_name='conversation_id'")).rows[0].n;
    if(!columns&&(await db.query('SELECT count(*)::int AS n FROM messages')).rows[0].n&&!allowLegacy){const error=new Error('Backup required before legacy migration. Set LEGACY_BACKUP_CONFIRMED=true only after verifying the backup.');error.code='backup_required';throw error;}}
  await db.transaction(async tx => {
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    for (const name of fs.readdirSync(path.join(__dirname, '../db/migrations')).filter(n => n.endsWith('.sql')).sort()) {
      if ((await tx.query('SELECT version FROM schema_migrations WHERE version=$1', [name])).rows.length) continue;
      await tx.exec(fs.readFileSync(path.join(__dirname, '../db/migrations', name), 'utf8'));
      // Preserve every legacy message. One conversation per owner, deterministic ordering by original ID.
      const owners = (await tx.query('SELECT DISTINCT user_id FROM messages WHERE conversation_id IS NULL')).rows;
      for (const row of owners) {
        const id = randomUUID();
        await tx.query("INSERT INTO conversations(id,user_id,title) VALUES($1,$2,'История до обновления')", [id, row.user_id]);
        await tx.query('UPDATE messages SET conversation_id=$1 WHERE user_id=$2 AND conversation_id IS NULL', [id, row.user_id]);
        const pairs = (await tx.query('SELECT id,role FROM messages WHERE conversation_id=$1 ORDER BY id', [id])).rows;
        let parent = null;
        for (const message of pairs) {
          if (message.role === 'user') parent = message.id;
          else if (parent) await tx.query('UPDATE messages SET parent_message_id=$1 WHERE id=$2', [parent, message.id]);
        }
      }
      await tx.exec('ALTER TABLE messages ALTER COLUMN conversation_id SET NOT NULL');
      await tx.query('INSERT INTO schema_migrations(version) VALUES($1)', [name]);
    }
    // A process stopped mid-stream cannot retain running status after a single-instance restart.
    await tx.exec("UPDATE messages SET status=CASE WHEN content='' THEN 'failed' ELSE 'partial' END WHERE status IN ('running','queued'); UPDATE generations SET status='failed',error_code='server_restart',finished_at=now() WHERE status IN ('queued','running');");
  });
}
function createDatabase(cfg) {
  if (!cfg.databaseUrl) return null;
  const url=new URL(cfg.databaseUrl);for(const key of['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
  const pool = new Pool({ connectionString: url.href,
    ssl: cfg.ssl ? { rejectUnauthorized: true, ca: cfg.ca } : false,
    max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    statement_timeout: 5000, query_timeout: 6000 });
  pool.on('error', () => console.error(JSON.stringify({ event: 'database_pool_error' })));
  return { query: (sql, params) => pool.query(sql, params), exec: sql => pool.query(sql),
    async transaction(fn) {
      const client = await pool.connect();
      const tx = { query: (sql, params) => client.query(sql, params), exec: sql => client.query(sql) };
      try { await client.query('BEGIN'); const result = await fn(tx); await client.query('COMMIT'); return result; }
      catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }, close: () => pool.end() };
}
module.exports = { migrate, createDatabase };
