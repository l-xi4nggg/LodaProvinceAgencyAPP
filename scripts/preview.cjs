// Loopback-only local preview. Production remains GitHub Pages + Google Apps Script.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),site=path.join(root,'site'),runtime=require('./preview-runtime.cjs')(root);
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.mov':'video/quicktime','.mp4':'video/mp4'};
const bridge=`<script>
function localRPC(success,failure){return new Proxy({}, {get(_,name){if(name==='withSuccessHandler')return fn=>localRPC(fn,failure);if(name==='withFailureHandler')return fn=>localRPC(success,fn);return (...args)=>fetch('/preview-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})}).then(response=>response.json()).then(result=>result.error?failure({message:result.error}):success(result.data)).catch(error=>failure({message:error.message}));}});}
window.google={script:{run:localRPC(()=>{},()=>{})}};
</script>`;
function streamFile(req,res,file,type,download=false){const stat=fs.statSync(file);res.setHeader('Content-Type',type||'application/octet-stream');res.setHeader('Accept-Ranges','bytes');res.setHeader('X-Content-Type-Options','nosniff');if(download)res.setHeader('Content-Disposition','attachment');
 if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416);res.end();return;}const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),stat.size-1):stat.size-1;if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':'bytes */'+stat.size});res.end();return;}res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':end-start+1});fs.createReadStream(file,{start,end}).pipe(res);return;}
 res.setHeader('Content-Length',stat.size);fs.createReadStream(file).pipe(res);
}
const server=http.createServer(async(req,res)=>{
 try{
  if(!['127.0.0.1:4173','localhost:4173'].includes(req.headers.host)){res.writeHead(403);res.end('Local preview only');return;}
  if(req.headers.origin&&!['http://127.0.0.1:4173','http://localhost:4173'].includes(req.headers.origin)){res.writeHead(403);res.end('Origin rejected');return;}
  const url=new URL(req.url,'http://127.0.0.1:4173');res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/preview-api'){
   if(req.method!=='POST'||!String(req.headers['content-type']).startsWith('application/json')){res.writeHead(405);res.end();return;}
   const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>6*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}
   res.setHeader('Content-Type','application/json');try{const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!Array.isArray(input.args)||typeof input.name!=='string')throw Error('Invalid request');res.end(JSON.stringify({data:runtime.call(input.name,input.args)}));}catch(error){res.statusCode=400;res.end(JSON.stringify({error:error.message}));}return;
  }
  if(url.pathname.startsWith('/preview-media/')){const id=url.pathname.split('/').pop();if(!/^local_[a-f0-9-]{36}$/.test(id)){res.writeHead(404);res.end();return;}const item=runtime.media(id);if(!item){res.writeHead(404);res.end();return;}streamFile(req,res,item.path,item.mime,url.searchParams.has('download'));return;}
  if(url.pathname.startsWith('/preview-embed/')){const id=url.pathname.split('/').pop(),item=runtime.media(id);if(!item||!/^local_[a-f0-9-]{36}$/.test(id)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',mime['.html']);res.end('<!doctype html><html><body style="margin:0;background:#111"><video style="width:100%;height:100vh" controls preload="metadata" src="/preview-media/'+id+'"></video></body></html>');return;}
  if(url.pathname==='/config.js'){res.setHeader('Content-Type',mime['.js']);res.end("const sharedGalleryURL=location.origin+'/gallery';");return;}
  if(url.pathname==='/gallery'){
   if(url.searchParams.get('mode')==='catalog'){res.setHeader('Content-Type',mime['.js']);res.end('window.lodaCatalogUpdates('+JSON.stringify(runtime.snapshot(url.searchParams.get('page'),url.searchParams.get('request'))).replace(/</g,'\\u003c')+');');return;}
   if(url.searchParams.get('mode')==='visit'){runtime.visit(url.searchParams.get('session'),url.searchParams.get('page'),url.searchParams.get('event'));res.setHeader('Content-Type',mime['.js']);res.end('void 0;');return;}
   let html=fs.readFileSync(path.join(root,'drive/Gallery.html'),'utf8');
   html=html.replace(/<\?!= include_\('([^']+)'\); \?>/g,(_,name)=>fs.readFileSync(path.join(root,'drive',name+'.html'),'utf8'))
    .replace("<?= adminView ? 'true' : 'false' ?>",url.searchParams.get('view')==='admin'?'true':'false').replace("<?= embedded ? 'true' : 'false' ?>",url.searchParams.get('embed')==='1'?'true':'false').replace('<?= initialLang ?>',['en','km'].includes(url.searchParams.get('lang'))?url.searchParams.get('lang'):'').replace('<?= initialTheme ?>',['dark','light'].includes(url.searchParams.get('theme'))?url.searchParams.get('theme'):'')
    .replace('<?= parentOrigin ?>','http://'+req.headers.host).replace('<?= homeURL ?>','/').replace('</head>',bridge+'</head>').replace('<main>','<main><p class="preview-banner" data-i18n="previewLabel"></p>');
   res.setHeader('Content-Type',mime['.html']);res.end(html);return;
  }
  const file=path.resolve(site,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}streamFile(req,res,file,mime[path.extname(file)]);
 }catch(error){if(!res.headersSent)res.writeHead(500);res.end('Preview error');console.error(error.message);}
});
server.listen(4173,'127.0.0.1',()=>{console.log('Local preview: http://127.0.0.1:4173/ | Admin: http://127.0.0.1:4173/gallery?view=admin');if(!runtime.hasPassword())console.log('Configure the admin password with node scripts/configure-admin.cjs');});
