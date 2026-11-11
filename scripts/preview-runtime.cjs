// Runs the actual Apps Script functions against LOCAL preview storage, never Google Drive.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
module.exports=function createRuntime(root){
 const local=path.join(root,'.local');fs.mkdirSync(path.join(local,'uploads'),{recursive:true});
 const read=(name,fallback)=>{const file=path.join(local,name);return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;};
 const write=(name,data)=>{const destination=path.join(local,name),temp=destination+'.tmp';fs.writeFileSync(temp,JSON.stringify(data),{mode:0o600});fs.renameSync(temp,destination);};
 const properties=read('properties.json',{}),records=read('drive-records.json',{files:{},folders:{},uploads:{}}),cache=new Map();let held=false,currentDuration=0;
 const save=()=>write('drive-records.json',records),setProperties=()=>write('properties.json',properties);
 const iterator=items=>{let i=0;return{hasNext:()=>i<items.length,next:()=>items[i++]};};
 const folder=id=>({getId:()=>id});
 function file(id){const record=records.files[id];if(!record)throw Error('File not found');return{
  getId:()=>id,getName:()=>record.name,setName:value=>{record.name=value;save();},getMimeType:()=>record.mime,getSize:()=>record.size,
  getDescription:()=>record.description||'',setDescription:value=>{record.description=value;save();},getParents:()=>iterator([folder(record.parent)]),
  getSharingAccess:()=>record.sharing,setSharing:access=>{record.sharing=access;save();},isTrashed:()=>!!record.trashed,setTrashed:value=>{record.trashed=value;save();},getDateCreated:()=>new Date(record.created),moveTo:value=>{record.parent=value.getId();save();}
 };}
 const response=(code,data={},headers={})=>({getResponseCode:()=>code,getContentText:()=>typeof data==='string'?data:JSON.stringify(data),getAllHeaders:()=>headers});
 const base64=value=>Buffer.from(value).toString('base64').replace(/\+/g,'-').replace(/\//g,'_');
 const context=vm.createContext({console,Date,URL,
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key]??null,setProperty:(key,value)=>{properties[key]=value;setProperties();},deleteProperty:key=>{delete properties[key];setProperties();},getProperties:()=>({...properties})})},
  CacheService:{getScriptCache:()=>({get:key=>{const entry=cache.get(key);return entry&&entry.expires>Date.now()?entry.value:null;},put:(key,value,ttl)=>cache.set(key,{value,expires:Date.now()+ttl*1000}),remove:key=>cache.delete(key)})},
  LockService:{getScriptLock:()=>({waitLock(){if(held)throw Error('Nested preview lock');held=true;},releaseLock(){held=false;}})},
  Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,text)=>crypto.createHash('sha256').update(text).digest(),computeHmacSha256Signature:(text,key)=>crypto.createHmac('sha256',key).update(text).digest(),base64EncodeWebSafe:base64,base64Decode:text=>Array.from(Buffer.from(text,'base64')),formatDate:date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)},
  ScriptApp:{getOAuthToken:()=> 'LOCAL-PREVIEW-NOT-A-GOOGLE-TOKEN'},
  DriveApp:{Access:{PRIVATE:'PRIVATE',ANYONE_WITH_LINK:'PUBLIC'},Permission:{VIEW:'VIEW'},createFolder(){const id='folder_'+crypto.randomUUID();records.folders[id]={};save();return folder(id);},getFolderById:id=>{if(!records.folders[id])throw Error('Folder not found');return folder(id);},getRootFolder:()=>({getFoldersByName:()=>iterator([])}),getFileById:file},
  UrlFetchApp:{fetch(url,options={}){
   if(url===properties.CATALOG_URL||url.includes('raw.githubusercontent.com/'))return response(200,fs.readFileSync(path.join(root,'site/data.js'),'utf8'));
   if(url.startsWith('https://www.googleapis.com/upload/drive/v3/files?')){
    const meta=JSON.parse(options.payload),id='local_'+crypto.randomUUID(),location='https://www.googleapis.com/upload/preview/'+id;
    records.files[id]={name:meta.name,mime:meta.mimeType,description:meta.description,parent:meta.parents[0],size:0,sharing:'PRIVATE',created:new Date().toISOString(),duration:currentDuration};
    records.uploads[location]={id,size:Number(options.headers['X-Upload-Content-Length']),offset:0};fs.writeFileSync(path.join(local,'uploads',id),Buffer.alloc(0));save();return response(200,{}, {Location:location});
   }
   if(records.uploads[url]){
    const session=records.uploads[url],record=records.files[session.id],range=options.headers['Content-Range'];
    if(!range.startsWith('bytes */')){const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(range);if(!match||Number(match[1])!==session.offset)throw Error('Invalid byte range');const bytes=Buffer.from(options.payload);if(bytes.length!==Number(match[2])-Number(match[1])+1)throw Error('Invalid chunk length');fs.appendFileSync(path.join(local,'uploads',session.id),bytes);session.offset+=bytes.length;record.size=session.offset;save();}
    return session.offset===session.size?response(200,{id:session.id}):response(308,{},session.offset?{Range:'bytes=0-'+(session.offset-1)}:{});
   }
   if(url.includes('?fields=videoMediaMetadata')){const id=url.split('/').pop().split('?')[0],record=records.files[id];return response(200,{videoMediaMetadata:{durationMillis:String(record.duration*1000)}});}
   if(url.includes('/drive/v3/files?q=')){const parsed=new URL(url),parent=parsed.searchParams.get('q').split("'")[1],offset=Number(parsed.searchParams.get('pageToken')||0);const files=Object.entries(records.files).filter(([,entry])=>entry.parent===parent&&!entry.trashed).sort((a,b)=>b[1].created.localeCompare(a[1].created)).map(([id])=>({id}));return response(200,{files:files.slice(offset,offset+30),nextPageToken:offset+30<files.length?String(offset+30):undefined});}
   throw Error('Preview blocks external Drive calls');
  }}
 });
 vm.runInContext(['Code.gs','Admin.gs','Branches.gs','Analytics.gs','Uploads.gs'].map(name=>fs.readFileSync(path.join(root,'drive',name),'utf8')).join('\n'),context);
 const allowed=new Set(['getPublicConfig','loginAdmin','getAdminCatalog','listMedia','updateMedia','deleteMedia','restoreStaticMedia','beginUpload','uploadChunk','getUploadStatus','cancelUpload','getAdminBranches','saveBranch','setBranchVisibility','getAdminAnalytics','recordGalleryVisit']);
 function rewrite(value){if(typeof value==='string')return value.replace(/https:\/\/l-xi4nggg.github.io\/LodaProvinceAgencyAPP\//g,'/').replace(/https:\/\/drive.google.com\/file\/d\/([\w-]+)\/preview/g,'/preview-embed/$1').replace(/https:\/\/drive.google.com\/file\/d\/([\w-]+)\/view/g,'/preview-media/$1').replace(/https:\/\/drive.google.com\/thumbnail\?id=([\w-]+)&sz=w600/g,'/preview-media/$1').replace(/https:\/\/drive.google.com\/uc\?export=download&id=([\w-]+)/g,'/preview-media/$1?download=1');if(Array.isArray(value))return value.map(rewrite);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rewrite(item)]));return value;}
 return{
  call(name,args){if(!allowed.has(name))throw Error('Unknown operation');if(name==='beginUpload')currentDuration=Number(args[0].duration)||0;if(name==='saveBranch'&&args[2]?.profile?.startsWith('/preview-media/')){const id=args[2].profile.split('/').pop().split('?')[0];args[2].profile='https://drive.google.com/thumbnail?id='+id+'&sz=w600';}return rewrite(context[name](...args));},
  snapshot(page,request){return rewrite({...context.publicOverrides_(),...context.listMedia(page||'',''),request});},
  visit(session,page,event){if(properties.ANALYTICS_ENABLED==='true')context.recordVisit_(session,page,event);},
  media(id){const record=records.files[id];if(!record||record.trashed||record.sharing!=='PUBLIC')return null;return{...record,path:path.join(local,'uploads',id)};},
  hasPassword:()=>!!properties.ADMIN_PASSWORD_HASH,
 };
};
