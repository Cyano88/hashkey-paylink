import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {digest,newApiKey} from './auth.mjs'
const fail=(message,status)=>{throw Object.assign(Error(message),{status})}
export function createStore(pool){
 const scoped=async(scope,fn)=>{
  const c=await pool.connect()
  try{await c.query('BEGIN');await c.query("SELECT set_config('hash.workspace_id',$1,true),set_config('hash.customer_id',$2,true)",[scope.workspaceId,scope.customerId]);const result=await fn(c);await c.query('COMMIT');return result}
  catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 return {
  async migrate(){const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(81723491)');await c.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));await c.query('COMMIT')}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}},
  async health(){await pool.query('SELECT 1')},
  async createWorkspace(name){const id=randomUUID(),keyId=randomUUID(),apiKey=newApiKey(),c=await pool.connect();try{await c.query('BEGIN');await c.query('INSERT INTO hash_workspaces(id,name) VALUES($1,$2)',[id,name]);await c.query('INSERT INTO hash_api_keys(id,workspace_id,key_hash) VALUES($1,$2,$3)',[keyId,id,digest(apiKey)]);await c.query('COMMIT');return {workspaceId:id,keyId,apiKey}}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}},
  async authenticate(apiKey){if(!/^hash_live_[A-Za-z0-9_-]{43}$/.test(apiKey))return null;const r=await pool.query('SELECT id,workspace_id FROM hash_api_keys WHERE key_hash=$1 AND revoked_at IS NULL',[digest(apiKey)]);return r.rows[0]?{keyId:r.rows[0].id,workspaceId:r.rows[0].workspace_id}:null},
  async activeSession(scope){const r=await pool.query('SELECT 1 FROM hash_api_keys WHERE id=$1 AND workspace_id=$2 AND revoked_at IS NULL',[scope.keyId,scope.workspaceId]);return r.rowCount===1},
  async revokeKey(id){await pool.query('UPDATE hash_api_keys SET revoked_at=now() WHERE id=$1',[id])},
  async createConversation(scope){return scoped(scope,async c=>{const id=randomUUID();const r=await c.query('INSERT INTO hash_conversations(id,workspace_id,customer_id) VALUES($1,$2,$3) RETURNING id,status,created_at',[id,scope.workspaceId,scope.customerId]);return r.rows[0]})},
  async conversation(scope,id){return scoped(scope,async c=>{const r=await c.query('SELECT id,status,created_at FROM hash_conversations WHERE workspace_id=$1 AND customer_id=$2 AND id=$3',[scope.workspaceId,scope.customerId,id]);if(!r.rows[0])fail('Conversation not found.',404);const m=await c.query('SELECT id,content,created_at FROM hash_messages WHERE workspace_id=$1 AND conversation_id=$2 ORDER BY created_at,id LIMIT 200',[scope.workspaceId,id]);return {...r.rows[0],messages:m.rows}})},
  async message(scope,id,requestId,content){return scoped(scope,async c=>{const r=await c.query('SELECT id,status FROM hash_conversations WHERE workspace_id=$1 AND customer_id=$2 AND id=$3 FOR UPDATE',[scope.workspaceId,scope.customerId,id]);if(!r.rows[0])fail('Conversation not found.',404);if(r.rows[0].status==='closed')fail('Conversation is closed.',409);const prior=await c.query('SELECT id,content,created_at FROM hash_messages WHERE workspace_id=$1 AND conversation_id=$2 AND request_id=$3',[scope.workspaceId,id,requestId]);if(prior.rows[0]){if(prior.rows[0].content!==content)fail('Request ID already used for another message.',409);return prior.rows[0]}const count=await c.query('SELECT count(*)::int AS n FROM hash_messages WHERE workspace_id=$1 AND conversation_id=$2',[scope.workspaceId,id]);if(count.rows[0].n>=200)fail('Conversation message limit reached.',409);const m=await c.query('INSERT INTO hash_messages(id,workspace_id,conversation_id,request_id,content) VALUES($1,$2,$3,$4,$5) RETURNING id,content,created_at',[randomUUID(),scope.workspaceId,id,requestId,content]);return m.rows[0]})},
  async deleteConversation(scope,id){return scoped(scope,async c=>{const r=await c.query('DELETE FROM hash_conversations WHERE workspace_id=$1 AND customer_id=$2 AND id=$3',[scope.workspaceId,scope.customerId,id]);if(!r.rowCount)fail('Conversation not found.',404)})},
 }
}
