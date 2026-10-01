CREATE TABLE IF NOT EXISTS hash_workspaces (
 id uuid PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hash_api_keys (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES hash_workspaces(id) ON DELETE CASCADE,
 key_hash text NOT NULL UNIQUE, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hash_conversations (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES hash_workspaces(id) ON DELETE CASCADE,
 customer_id text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,id)
);
CREATE INDEX IF NOT EXISTS hash_customer_conversations ON hash_conversations(workspace_id,customer_id,created_at);
CREATE TABLE IF NOT EXISTS hash_messages (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL, conversation_id uuid NOT NULL,
 request_id text NOT NULL, content text NOT NULL CHECK(length(content) BETWEEN 1 AND 1500), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,conversation_id) REFERENCES hash_conversations(workspace_id,id) ON DELETE CASCADE,
 UNIQUE(workspace_id,conversation_id,request_id)
);
ALTER TABLE hash_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hash_conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE hash_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE hash_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hash_conversation_scope ON hash_conversations;
CREATE POLICY hash_conversation_scope ON hash_conversations USING (
 workspace_id::text=current_setting('hash.workspace_id',true) AND customer_id=current_setting('hash.customer_id',true)
) WITH CHECK (workspace_id::text=current_setting('hash.workspace_id',true) AND customer_id=current_setting('hash.customer_id',true));
DROP POLICY IF EXISTS hash_message_scope ON hash_messages;
CREATE POLICY hash_message_scope ON hash_messages USING (
 workspace_id::text=current_setting('hash.workspace_id',true) AND EXISTS(SELECT 1 FROM hash_conversations c WHERE c.id=conversation_id AND c.workspace_id=hash_messages.workspace_id)
) WITH CHECK (workspace_id::text=current_setting('hash.workspace_id',true) AND EXISTS(SELECT 1 FROM hash_conversations c WHERE c.id=conversation_id AND c.workspace_id=hash_messages.workspace_id));
