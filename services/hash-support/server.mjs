import http from 'node:http'
import {createInferenceCheck} from './inference.mjs'
import pg from 'pg'
import {createApp} from './app.mjs'
import {createStore} from './store.mjs'
const databaseUrl=process.env.DATABASE_URL
if(!databaseUrl)throw Error('Private DATABASE_URL is required.')
const pool=new pg.Pool({connectionString:databaseUrl,max:5,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:5000})
pool.on('error',()=>console.error('Hash database connection unavailable.'))
const store=createStore(pool)
const role=await pool.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')
if(role.rows[0]?.rolsuper||role.rows[0]?.rolbypassrls)throw Error('Hash requires a database role without RLS bypass privileges.')
await store.migrate()
const server=http.createServer(createApp({store,adminSecret:process.env.HASH_ADMIN_SECRET,sessionSecret:process.env.HASH_SESSION_SECRET,inferenceCheck:createInferenceCheck({store,apiKey:process.env.HASH_0G_API_KEY})}))
server.requestTimeout=15000;server.headersTimeout=10000
server.listen(Number(process.env.PORT||3100),'0.0.0.0',()=>console.info('Hash support service ready. Inference disabled.'))
const stop=()=>{server.close(()=>void pool.end().then(()=>process.exit(0)));setTimeout(()=>process.exit(1),10000).unref()};process.on('SIGTERM',stop);process.on('SIGINT',stop)
