// Synthetic preview only. No live identity, customer, payment or signing calls.
import { build } from 'esbuild'
import fs from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve, extname, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
const root = process.cwd(), out = resolve(root, 'output/playwright/operations-preview'), port = Number(process.env.OPERATIONS_PREVIEW_PORT || 4321)
await fs.mkdir(out, { recursive: true })
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import App from './src/surfaces/DeveloperApp';import '@fontsource/plus-jakarta-sans/400.css';import '@fontsource/plus-jakarta-sans/500.css';import '@fontsource/plus-jakarta-sans/600.css';import '@fontsource/plus-jakarta-sans/700.css';
import {ThemeProvider} from './src/lib/ThemeContext';
const project={id:'dev_preview12345678',name:'Hash PayStream · Human',ownerEmail:'founder@example.test',website:'https://example.test',useCase:'Synthetic agreement integration for the desktop preview.',checkoutMode:'human',capabilities:['arc_agreements','xstocks_agreements'],settlementMode:'usdc',settlementStatus:'ready',operationalStatus:'active',networks:['arc'],defaultNetwork:'arc',recipients:{arc:'0x1111111111111111111111111111111111111111'},allowedOrigins:['https://example.test'],webhookUrl:'https://example.test/events',webhookConfigured:true,keys:[{id:'key_preview',prefix:'hpl_app_example',environment:'live'}],arcAgreementPilot:{status:'approved',maxAgreementUsdc:'1',dailyVolumeUsdc:'1',maxActiveAgreements:1,maxDurationSeconds:604800},createdAt:'2026-09-25T12:00:00Z',updatedAt:'2026-10-02T12:00:00Z'};
const workspace={id:'hashpaystream',name:'Hash PayStream',projectIds:[project.id],sections:['projects','agreements','trade-disputes'],missingProjectIds:[],integrations:[{id:project.id,name:project.name,capabilities:project.capabilities,status:'active'}]};
window.__requests=[];window.fetch=async(url,opts={})=>{const u=new URL(String(url),location.origin);window.__requests.push({path:u.pathname,workspace:u.searchParams.get('workspace'),body:opts.body});
if(u.pathname==='/api/operations-session'&&location.search.includes('loading'))return new Promise(()=>{});
if(u.pathname==='/api/operations-session'){if(location.search.includes('denied'))return Response.json({ok:false,error:'This account has no operations access.'},{status:403});const limited=location.search.includes('limited');return Response.json({ok:true,founder:!limited,email:'founder@example.test',arcActivationEnabled:false,workspaces:limited?[{...workspace,sections:['trade-disputes']}]:[{id:'pocket',name:'Pocket',projectIds:[],sections:['support','transactions'],integrations:[],missingProjectIds:[]},workspace,{id:'external-demo',name:'External product',projectIds:['dev_external123456'],sections:['projects'],missingProjectIds:[],integrations:[{id:'dev_external123456',name:'Checkout integration',capabilities:['hosted_checkout'],status:'active'}]}]})}
if(u.pathname==='/api/developer-projects'){if(u.searchParams.get('workspace')!=='hashpaystream')return Response.json({ok:false,error:'Workspace fixture is not configured.'},{status:404});return Response.json({ok:true,scope:'admin',projects:[project],summary:{total:1,active:1,setupRequired:0,suspended:0}})}
if(u.pathname==='/api/arc-agreement-operations')return Response.json({ok:true,workerEnabled:false,agreements:[],summary:{total:0,active:0,review:0,attention:0,terminal:0}});
if(u.pathname==='/api/pocket/support/cases')return Response.json({ok:true,cases:[],staffName:'Preview operator',knowledge:[]});
if(u.pathname==='/api/admin/pocket/transactions')return Response.json({ok:true,executions:[],summary:{unresolved:0,processing:0,needsReview:0,stale:0}});
if(u.pathname==='/api/xstocks-review'){const body=JSON.parse(opts.body||'{}');if(body.action==='list')return Response.json({ok:true,items:[{id:'xag_'+'12'.repeat(32),projectId:project.id,title:'Sample delivery dispute',state:5,observedBlock:'123456'}],nextCursor:null});return Response.json({ok:false,error:'Synthetic case opened. No chain or signing calls were made.'},{status:409})}
throw Error('No live calls allowed in preview: '+u.pathname)};
createRoot(document.getElementById('root')).render(<ThemeProvider><App/></ThemeProvider>);`
await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, outfile: resolve(out, 'app.js'), bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', loader: { '.woff': 'file', '.woff2': 'file' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '{}' }, plugins: [{ name: 'fixture-identity', setup(b) {
    b.onResolve({ filter: /^@privy-io\/react-auth$/ }, () => ({ path: 'privy', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const usePrivy=()=>({ready:true,authenticated:true,user:{id:'preview-user'},getAccessToken:async()=>'synthetic-token',logout:async()=>{}});export const useWallets=()=>({wallets:[]});`, loader: 'js' }))
    b.onLoad({ filter: /PocketEmailLogin\.tsx$/ }, () => ({ contents: 'export default function Login(){return null}', loader: 'tsx' }))
    b.onLoad({ filter: /PrivyWalletConnectButton\.tsx$/ }, () => ({ contents: 'export function PrivyWalletConnectButton(){return null}', loader: 'tsx' }))
  } }] })
const css = spawnSync(process.execPath, ['node_modules/tailwindcss/lib/cli.js', '-i', 'src/index.css', '-o', resolve(out, 'styles.css')], { cwd: root, encoding: 'utf8' })
if (css.status !== 0) throw Error(css.stderr)
await fs.writeFile(resolve(out, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hash PayLink Operations · Synthetic preview</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
if (!process.argv.includes('--build-only')) createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    let file = pathname === '/hash-logo-transparent.png' ? resolve(root, 'public/hash-logo-transparent.png') : resolve(out, '.' + pathname)
    if (pathname !== '/hash-logo-transparent.png' && (!file.startsWith(out + sep) || !extname(file))) file = resolve(out, 'index.html')
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' })[extname(file)] || 'application/octet-stream')
    res.end(await fs.readFile(file))
  } catch { res.statusCode = 404; res.end('Not found') }
}).listen(port, '127.0.0.1', () => console.log('Synthetic operations preview: http://127.0.0.1:' + port + '/admin'))
