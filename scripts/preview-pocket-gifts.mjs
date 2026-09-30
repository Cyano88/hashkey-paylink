import {createServer} from 'vite'
import {realpathSync} from 'node:fs'
// This checkout may share node_modules with the primary worktree.
const server=await createServer({server:{host:'127.0.0.1',port:5187,strictPort:true,fs:{allow:[process.cwd(),realpathSync('node_modules')]}}})
await server.listen()
console.log('Pocket gift preview: http://127.0.0.1:5187/pocket-gift-preview.html')
