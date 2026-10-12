const fs=require('node:fs'),path=require('node:path');
if(!process.argv[2])throw new Error('Provide an explicit deliverable directory under outputs.');
const root=path.resolve(__dirname,'..'),target=path.resolve(process.argv[2]);
if(!target.includes(path.sep+'outputs'+path.sep)||target===root||target.startsWith(root+path.sep))throw new Error('Deliverable must be outside source root, in outputs.');
function copy(from,to){fs.mkdirSync(to,{recursive:true});for(const item of fs.readdirSync(from,{withFileTypes:true})){
 if(['node_modules','.env','test-results','conversations.log.jsonl'].includes(item.name)||(item.name.startsWith('.env.')&&item.name!=='.env.example')||item.name.startsWith('.browser-profile')||item.name==='.git'||item.isSymbolicLink())continue;
 const source=path.join(from,item.name),dest=path.join(to,item.name);if(item.isDirectory())copy(source,dest);else fs.copyFileSync(source,dest);
}}
copy(root,target);console.log('Source deliverable prepared. Dependencies and real secrets excluded.');
