const fs=require('node:fs'),path=require('node:path');
async function build(){const dest=path.join(__dirname,'../public/vendor');fs.mkdirSync(dest,{recursive:true});const files={'dompurify/dist/purify.min.js':'purify.min.js','marked/lib/marked.umd.js':'marked.umd.js','highlight.js/styles/atom-one-dark.min.css':'atom-one-dark.min.css'};
for(const[source,target]of Object.entries(files)){const full=path.join(__dirname,'../node_modules',source);fs.copyFileSync(full,path.join(dest,target));}
await require('esbuild').build({entryPoints:[require.resolve('highlight.js/lib/common')],bundle:true,platform:'browser',format:'iife',globalName:'hljs',outfile:path.join(dest,'highlight.js'),minify:true});
const licenses=['dompurify','marked','highlight.js'];for(const name of licenses){const packageDir=path.join(__dirname,'../node_modules',name);const license=fs.readdirSync(packageDir).find(n=>/^license/i.test(n));if(license)fs.copyFileSync(path.join(packageDir,license),path.join(dest,name+'-LICENSE.txt'));}
}
build().catch(error=>{console.error(error.message);process.exitCode=1;});
