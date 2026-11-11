const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  const properties = new Map([['ADMIN_SECRET', 'test-only-long-random-admin-secret-123456789']]);
  const cache = new Map(), files = new Map(), folders = new Map(), uploads = new Map();
  let held = false, nextID = 0, duration = 59999, throwAfterCommit = false;
  const iterator = array => { let i = 0; return {hasNext: () => i < array.length, next: () => array[i++]}; };
  const response = (code, data = {}, headers = {}) => ({getResponseCode: () => code, getContentText: () => JSON.stringify(data), getAllHeaders: () => headers});
  function folder() { const id = 'folder_' + (++nextID); const item = {getId: () => id}; folders.set(id, item); return item; }
  function makeFile(id, metadata) {
    return {id, name:metadata.name, mime:metadata.mimeType, description:metadata.description, parent:metadata.parents[0], size:0, sharing:'PRIVATE', trashed:false,
      getId(){return this.id;}, getName(){return this.name;}, setName(value){this.name=value;}, getMimeType(){return this.mime;}, getSize(){return this.size;},
      getDescription(){return this.description;}, setDescription(value){this.description=value;}, getParents(){return iterator([folders.get(this.parent)]);},
      getSharingAccess(){return this.sharing;}, setSharing(access){this.sharing=access;}, isTrashed(){return this.trashed;}, setTrashed(value){this.trashed=value;},
      getDateCreated(){return new Date('2026-11-11T00:00:00Z');}, moveTo(value){this.parent=value.getId();}
    };
  }
  const context = vm.createContext({console, URL, Date,
    PropertiesService: {getScriptProperties: () => ({getProperty:key=>properties.get(key)||null, setProperty:(key,value)=>properties.set(key,value), deleteProperty:key=>properties.delete(key), getProperties:()=>Object.fromEntries(properties)})},
    CacheService: {getScriptCache:()=>({get:key=>cache.get(key), put:(key,value)=>cache.set(key,value), remove:key=>cache.delete(key)})},
    LockService: {getScriptLock:()=>({waitLock(){assert.equal(held,false,'nested lock');held=true;}, releaseLock(){held=false;}})},
    Utilities: {getUuid:()=>crypto.randomUUID(), DigestAlgorithm:{SHA_256:'sha256'},
      computeDigest:(algorithm,text)=>crypto.createHash('sha256').update(text).digest(),
      computeHmacSha256Signature:(text,key)=>crypto.createHmac('sha256',key).update(text).digest(),
      base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url'), base64Decode:value=>Array.from(Buffer.from(value,'base64')), formatDate:date=>date.toISOString().slice(0,10)},
    ScriptApp:{getOAuthToken:()=> 'server-only-oauth-token'},
    DriveApp: {Access:{PRIVATE:'PRIVATE',ANYONE_WITH_LINK:'PUBLIC'},Permission:{VIEW:'VIEW'},createFolder:folder,getFolderById:id=>folders.get(id),getRootFolder:()=>({getFoldersByName:()=>iterator([])}),getFileById:id=>{assert.ok(files.has(id),'unknown file');return files.get(id);}},
    UrlFetchApp:{fetch(url,options={}) {
      if(url.startsWith('https://raw.githubusercontent.com/')) return {getResponseCode:()=>200,getContentText:()=> 'const catalog='+JSON.stringify({media:[{name:'Original',url:'media/0.webp',category:'Agency Profile',video:false}],branches:[{name:'Agency',code:'1',province:'Phnom Penh',profile:'media/0.webp'}]})+';'};
      assert.equal(options.headers.Authorization,'Bearer server-only-oauth-token');
      if(url.startsWith('https://www.googleapis.com/upload/drive/v3/files?')) {
        const metadata=JSON.parse(options.payload), id='uploaded_file_'+(++nextID), location='https://www.googleapis.com/upload/session/'+id;
        const entry={file:makeFile(id,metadata),offset:0,size:Number(options.headers['X-Upload-Content-Length'])};
        files.set(id,entry.file);uploads.set(location,entry);return response(200,{}, {Location:location});
      }
      if(uploads.has(url)) {
        const entry=uploads.get(url), range=options.headers['Content-Range'];
        if(!range.startsWith('bytes */')) {
          assert.equal(options.followRedirects,false);const match=/bytes (\d+)-(\d+)\/(\d+)/.exec(range);
          assert.equal(Number(match[1]),entry.offset);assert.equal(options.payload.length,Number(match[2])-Number(match[1])+1);
          entry.offset=Number(match[2])+1;entry.file.size=entry.offset;
          if(throwAfterCommit){throwAfterCommit=false;throw Error('response lost');}
        }
        return entry.offset===entry.size?response(200,{id:entry.file.id}):response(308,{}, entry.offset?{Range:'bytes=0-'+(entry.offset-1)}:{});
      }
      if(url.includes('?fields=videoMediaMetadata')) return response(200,{videoMediaMetadata:duration?{durationMillis:String(duration)}:{}});
      if(url.includes('/drive/v3/files?q=')) {
        const q=new URL(url).searchParams.get('q'), folderID=q.split("'")[1];
        return response(200,{files:[...files.values()].filter(file=>file.parent===folderID&&!file.trashed).map(file=>({id:file.id}))});
      }
      throw Error('Unexpected request '+url);
    }}
  });
  const code=['Code.gs','Admin.gs','Branches.gs','Analytics.gs','Uploads.gs'].map(file=>fs.readFileSync(path.join(__dirname,'../drive',file),'utf8')).join('\n');
  vm.runInContext(code,context);
  return {api:context, files, properties, setDuration(value){duration=value;}, loseResponse(){throwAfterCommit=true;}, login(){return context.loginAdmin(properties.get('ADMIN_SECRET')).token;}};
}
const imageBytes=()=>Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const videoBytes=()=>Buffer.from([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
const imageInput=(size=imageBytes().length)=>({name:'រូបភាពសាកល្បង',mime:'image/png',size,category:'shared'});
const videoInput=()=>({name:'វីដេអូសាកល្បង',mime:'video/mp4',size:videoBytes().length,duration:59.999,category:'shared'});

test('anonymous reads work, every admin mutation rejects unauthenticated calls',()=>{
  const {api}=setup();assert.equal(api.getPublicConfig().maxVideoSeconds,60);assert.equal(api.listMedia('','').items.length,0);
  for(const call of [()=>api.getAdminCatalog(''),()=>api.updateMedia('','static:media/0.webp',{name:'x',category:'shared'}),()=>api.deleteMedia('','static:media/0.webp'),()=>api.restoreStaticMedia('','static:media/0.webp')])assert.throws(call,/Admin/);
});
test('login rate limit, tampering and expired signed tokens',()=>{
  const env=setup(), token=env.login();assert.doesNotThrow(()=>env.api.requireAdmin_(token));
  assert.throws(()=>env.api.requireAdmin_(token+'x'),/Admin/);
  const expired='1:'+crypto.randomUUID();assert.throws(()=>env.api.requireAdmin_(expired+'.'+env.api.sign_(expired)),/Admin/);
  for(let i=0;i<10;i++)assert.throws(()=>env.api.loginAdmin('wrong'));
  assert.throws(()=>env.login(),/10/);
});
test('exact size/duration boundaries and invalid MIME are enforced server-side',()=>{
  const {api}=setup();
  assert.doesNotThrow(()=>api.validateUpload_({...videoInput(),size:999999999}));
  for(const change of [{size:1000000000},{size:0},{duration:60},{duration:60.001},{duration:NaN},{mime:'image/svg+xml'}])assert.throws(()=>api.validateUpload_({...videoInput(),...change}));
  assert.throws(()=>api.validateUpload_({...imageInput(),size:20*1024*1024+1}));
  assert.throws(()=>api.beginUpload({...imageInput(),replaceID:'static:media/0.webp'},''),/Admin/);
  assert.throws(()=>api.beginUpload({...imageInput(),category:'Content Poster'},''),/Admin/);
});
test('public image upload publishes named file, is idempotent and can be read anonymously',()=>{
  const env=setup(), bytes=imageBytes(), session=env.api.beginUpload(imageInput(),'');
  assert.equal(session.chunkBytes,4*1024*1024);assert.equal(session.location,undefined);
  const result=env.api.uploadChunk(session.token,0,bytes.toString('base64'),'');
  assert.equal(result.done,true);assert.equal(env.api.listMedia('','').items[0].name,'រូបភាពសាកល្បង');
  assert.equal(env.api.uploadChunk(session.token,0,bytes.toString('base64'),'').done,true);
  assert.equal(env.api.cancelUpload(session.token,''),false);
});
test('wrong signature, oversize chunk and unexpected offsets never commit bytes',()=>{
  const {api}=setup(), session=api.beginUpload(imageInput(),'');
  assert.throws(()=>api.uploadChunk(session.token,0,Buffer.alloc(12).toString('base64'),''));
  assert.throws(()=>api.uploadChunk(session.token,0,'a'.repeat(5592410),''));
  assert.equal(api.uploadChunk(session.token,1,imageBytes().toString('base64'),'').offset,0);
});
test('lost chunk response resumes from authoritative Drive Range without duplicate data',()=>{
  const env=setup(), length=256*1024, bytes=Buffer.alloc(length);imageBytes().copy(bytes);
  const session=env.api.beginUpload(imageInput(length+12),'');env.loseResponse();
  assert.throws(()=>env.api.uploadChunk(session.token,0,bytes.toString('base64'),''),/lost/);
  assert.equal(env.api.getUploadStatus(session.token,'').offset,length);
  assert.equal(env.api.uploadChunk(session.token,length,imageBytes().toString('base64'),'').done,true);
});
test('video remains private while metadata is pending; server rejects 60 seconds',()=>{
  const env=setup();env.setDuration(0);const session=env.api.beginUpload(videoInput(),'');
  assert.equal(env.api.uploadChunk(session.token,0,videoBytes().toString('base64'),'').processing,true);
  const file=[...env.files.values()][0];assert.equal(file.sharing,'PRIVATE');assert.equal(env.api.listMedia('','').items.length,0);
  env.setDuration(60000);assert.throws(()=>env.api.getUploadStatus(session.token,''),/60/);assert.equal(file.trashed,true);assert.equal(file.sharing,'PRIVATE');
});
test('59.999-second video publishes only after independent metadata check, cancellation stays private',()=>{
  const env=setup();env.setDuration(0);const session=env.api.beginUpload(videoInput(),'');env.api.uploadChunk(session.token,0,videoBytes().toString('base64'),'');
  env.setDuration(59999);assert.equal(env.api.getUploadStatus(session.token,'').done,true);assert.equal(env.api.listMedia('','').items[0].video,true);
  env.setDuration(0);const pending=env.api.beginUpload(videoInput(),'');env.api.uploadChunk(pending.token,0,videoBytes().toString('base64'),'');
  assert.equal(env.api.cancelUpload(pending.token,''),true);assert.equal([...env.files.values()][1].trashed,true);
});
test('admin renames, hides, restores and replaces original catalog; public cannot hijack admin upload',()=>{
  const env=setup(), token=env.login(), id='static:media/0.webp';
  env.api.updateMedia(token,id,{name:'ថ្មី',category:'Content Poster'});assert.equal(env.api.getAdminCatalog(token).items[0].name,'ថ្មី');
  env.api.deleteMedia(token,id);assert.equal(env.api.publicOverrides_().overrides[id].deleted,true);
  env.api.restoreStaticMedia(token,id);assert.equal(env.api.publicOverrides_().overrides[id].deleted,false);
  const session=env.api.beginUpload({...imageInput(),replaceID:id,category:'Content Poster'},token);
  assert.throws(()=>env.api.uploadChunk(session.token,0,imageBytes().toString('base64'),''),/Admin/);
  assert.equal(env.api.uploadChunk(session.token,0,imageBytes().toString('base64'),token).done,true);
  assert.match(env.api.publicOverrides_().overrides[id].url,/drive.google.com/);assert.equal(env.api.listMedia('','').items.length,0);
});
test('admin Drive replacement preserves old file until successful upload, then trashes it',()=>{
  const env=setup(), token=env.login(), first=env.api.beginUpload(imageInput(),'');
  const old=env.api.uploadChunk(first.token,0,imageBytes().toString('base64'),'').item;
  const next=env.api.beginUpload({...imageInput(),replaceID:old.id},token);
  assert.equal(env.files.get(old.id.slice(6)).trashed,false);
  env.api.uploadChunk(next.token,0,imageBytes().toString('base64'),token);
  assert.equal(env.files.get(old.id.slice(6)).trashed,true);assert.equal(env.api.listMedia('','').items.length,1);
});
test('configured password hash is separate from the signing secret and never public',()=>{
  const env=setup();env.api.setAdminPassword_('test-only-password');const token=env.api.loginAdmin('test-only-password').token;
  assert.doesNotThrow(()=>env.api.requireAdmin_(token));assert.throws(()=>env.login());
  assert.equal(JSON.stringify(env.api.getPublicConfig()).includes('PASSWORD'),false);
});
test('branch edits, additions, visibility and image changes require admin and validate fields',()=>{
  const env=setup(),token=env.login(),input={name:'New name',code:'1',province:'Phnom Penh',phone:'012345678',map:'https://maps.app.goo.gl/test',profile:'media/0.webp',lat:11.5,lng:104.9};
  assert.throws(()=>env.api.saveBranch('','branch:0',input),/Admin/);
  for(const change of [{map:'javascript:alert(1)'},{lat:91},{lng:''},{name:''}])assert.throws(()=>env.api.saveBranch(token,'branch:0',{...input,...change}));
  env.api.saveBranch(token,'branch:0',input);assert.equal(env.api.getAdminBranches(token).items[0].name,'New name');assert.match(env.api.getAdminBranches(token).items[0].profilePreview,/^https:\/\//);
  env.api.setBranchVisibility(token,'branch:0',true);assert.equal(env.api.branchOverrides_()['branch:0'].deleted,true);
  const added=env.api.saveBranch(token,'',{...input,code:'2'});assert.match(added.id,/^new:/);assert.equal(env.api.getAdminBranches(token).items.length,2);
  const session=env.api.beginUpload({...imageInput(),branchID:'branch:0',category:'Agency Profile',subcategory:'Agent Logo'},token);
  env.api.uploadChunk(session.token,0,imageBytes().toString('base64'),token);assert.match(env.api.branchOverrides_()['branch:0'].profile,/thumbnail/);assert.equal(env.api.listMedia('','').items.length,0);
});
test('subcategories persist on public uploads and admin edits',()=>{
  const env=setup(),token=env.login(),session=env.api.beginUpload({...imageInput(),subcategory:'promotions'},'');
  const item=env.api.uploadChunk(session.token,0,imageBytes().toString('base64'),'').item;assert.equal(item.subcategory,'promotions');
  env.api.updateMedia(token,item.id,{name:'Renamed',category:'shared',subcategory:'products'});assert.equal(env.api.listMedia('','').items[0].subcategory,'products');
});
test('analytics is opt-in, deduplicates events and protects the report',()=>{
  const env=setup(),token=env.login(),session='session-1234567890123456',event='event-1234567890123456';
  env.api.recordVisit_(session,'library',event);assert.equal(env.api.getAdminAnalytics(token).days.length,0);
  env.properties.set('ANALYTICS_ENABLED','true');env.api.recordVisit_(session,'library',event);env.api.recordVisit_(session,'library',event);env.api.recordVisit_(session,'directory',event+'second');
  env.properties.set('stats:2000-01-01',JSON.stringify({views:100,visits:100,pages:{}}));
  const day=env.api.getAdminAnalytics(token).days[0];assert.equal(day.views,2);assert.equal(day.visits,1);assert.throws(()=>env.api.getAdminAnalytics(''),/Admin/);
});
