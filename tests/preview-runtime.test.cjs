const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
test('local preview executes actual backend CRUD and keeps credentials outside public responses',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'loda-runtime-'));
 try{
  const sourceRoot=path.join(__dirname,'..');fs.mkdirSync(path.join(temp,'drive'));fs.mkdirSync(path.join(temp,'site'));fs.mkdirSync(path.join(temp,'.local'));
  for(const file of['Code.gs','Admin.gs','Branches.gs','Analytics.gs','Uploads.gs'])fs.copyFileSync(path.join(sourceRoot,'drive',file),path.join(temp,'drive',file));
  fs.writeFileSync(path.join(temp,'site/data.js'),'const catalog='+JSON.stringify({media:[{name:'Logo',category:'Agency Profile',url:'media/0.webp'}],branches:[{name:'Agency',code:'1',province:'Phnom Penh',profile:'media/0.webp'}]})+';');
  const secret=crypto.randomBytes(48).toString('base64url'),password='test-only-password';
  const hash=crypto.createHmac('sha256',secret).update('password:'+password).digest('base64').replace(/\+/g,'-').replace(/\//g,'_');
  fs.writeFileSync(path.join(temp,'.local/properties.json'),JSON.stringify({ADMIN_SECRET:secret,ADMIN_PASSWORD_HASH:hash}));
  const runtime=require('../scripts/preview-runtime.cjs')(temp),token=runtime.call('loginAdmin',[password]).token;
  assert.throws(()=>runtime.call('requireAdmin_',[token]),/Unknown/);assert.equal(JSON.stringify(runtime.call('getPublicConfig',[])).includes(secret),false);
  const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const upload=runtime.call('beginUpload',[{name:'Local image',mime:'image/png',size:bytes.length,category:'shared',subcategory:'promotions'},'']);
  const result=runtime.call('uploadChunk',[upload.token,0,bytes.toString('base64'),'']);assert.equal(result.done,true);assert.match(result.item.url,/^\/preview-media\//);
  runtime.call('updateMedia',[token,result.item.id,{name:'Updated locally',category:'shared',subcategory:'products'}]);assert.equal(runtime.snapshot('','request').items[0].name,'Updated locally');
  runtime.call('saveBranch',[token,'branch:0',{name:'Updated agency',code:'1',province:'Phnom Penh',profile:'media/0.webp'}]);assert.equal(runtime.snapshot('','request').branchOverrides['branch:0'].name,'Updated agency');
  runtime.call('deleteMedia',[token,result.item.id]);assert.equal(runtime.snapshot('','request').items.length,0);
 }finally{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep+'loda-runtime-'));fs.rmSync(temp,{recursive:true,force:true});}
});
