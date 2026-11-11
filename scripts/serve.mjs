import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
const target=new URL('../dist/index.html',import.meta.url),port=Number(process.env.PORT||8766);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('PORT must be an integer between 1024 and 65535');
await stat(target).catch(()=>{throw Error('Build first: npm run build');});
const server=createServer((req,res)=>{if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}if(!['/','/index.html'].includes(req.url.split('?')[0])){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else createReadStream(target).pipe(res);});
server.on('error',e=>{console.error(e.message);process.exitCode=1;});server.listen(port,'127.0.0.1',()=>console.log(`BRAIN_P beta: http://127.0.0.1:${port}/ (loopback only; no directory listing)`));
