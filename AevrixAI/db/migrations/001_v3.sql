CREATE TABLE IF NOT EXISTS users (
 id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), session_version INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS conversations (
 id UUID PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL DEFAULT 'Новый диалог', mode TEXT NOT NULL DEFAULT 'chat',
 search_mode TEXT NOT NULL DEFAULT 'auto', archived_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT conversation_mode CHECK (mode IN ('chat','explain','hint','check','quiz')),
 CONSTRAINT conversation_search CHECK (search_mode IN ('auto','on','off'))
);
CREATE TABLE IF NOT EXISTS messages (
 id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role TEXT NOT NULL, content TEXT NOT NULL, sources JSONB DEFAULT '[]', tone TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS parent_message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS generations (
 id UUID PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 user_message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 assistant_message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 client_key UUID NOT NULL, fingerprint TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
 model TEXT, usage JSONB NOT NULL DEFAULT '{}', finish_reason TEXT, error_code TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
 UNIQUE(user_id, client_key)
);
CREATE TABLE IF NOT EXISTS attachments (
 id UUID PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
 filename TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
 data BYTEA NOT NULL, kind TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS document_chunks (
 id SERIAL PRIMARY KEY, attachment_id UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
 page INTEGER NOT NULL, ordinal INTEGER NOT NULL, content TEXT NOT NULL,
 search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
);
CREATE TABLE IF NOT EXISTS conversation_summaries (
 conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
 covered_end INTEGER NOT NULL, content TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_preferences (
 user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 instructions TEXT NOT NULL DEFAULT '', memory_enabled BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS bookmarks (
 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,message_id)
);
CREATE TABLE IF NOT EXISTS reports (
 id UUID PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
 category TEXT NOT NULL, comment TEXT NOT NULL, context JSONB NOT NULL DEFAULT '[]',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), delivered_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS messages_conversation_order ON messages(conversation_id,id);
CREATE INDEX IF NOT EXISTS conversations_owner ON conversations(user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS chunks_search ON document_chunks USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS attachments_owner ON attachments(user_id,conversation_id);
