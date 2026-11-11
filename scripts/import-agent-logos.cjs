const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),source=process.env.LODA_LOGO_SOURCE||'D:/LODA/ChatGPT/LodaProvinceAgencyAPP/Agent Logo';
const catalogFile=path.join(root,'site/data.js'),sandbox=vm.createContext({});
vm.runInContext(fs.readFileSync(catalogFile,'utf8')+';globalThis.data=catalog',sandbox);
const catalog=JSON.parse(JSON.stringify(sandbox.data));
const norm=s=>String(s).normalize('NFC').replace(/[\s\u200b\u200c\u200d_-]+/g,'').toLowerCase();
const known=new Set(catalog.media.filter(x=>x.category==='Agency Profile').map(x=>norm(x.name)));
const files=fs.readdirSync(source,{withFileTypes:true}).filter(x=>x.isFile()&&/\.(jpe?g|png|webp)$/i.test(x.name)).map(x=>x.name).sort();
const initialNames=new Set(known),seenHashes=new Set();let existingByName=0,duplicateSourceFiles=0;
const additions=files.filter(file=>{
  const name=norm(path.parse(file).name),hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(source,file))).digest('hex');
  if(initialNames.has(name)){existingByName++;return false;}
  if(known.has(name)||seenHashes.has(hash)){duplicateSourceFiles++;return false;}
  known.add(name);seenHashes.add(hash);return true;
});
let id=Math.max(...catalog.media.map(x=>Number((/media\/(\d+)/.exec(x.url)||[])[1])||0))+1;
const report={sourceFiles:files.length,existingByName,duplicateSourceFiles,added:[],branchProfilesLinked:0};
for(const file of additions){
  const name=path.parse(file).name,ext=path.extname(file).toLowerCase(),url='media/'+id+++ext;
  report.added.push({name,url,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(source,file))).digest('hex')});
  if(process.argv.includes('--apply')){
    fs.copyFileSync(path.join(source,file),path.join(root,'site',url));
    catalog.media.push({name,file,url,category:'Agency Profile',subcategory:'Agent Logo',video:false});
    // Warehouse codes and salesperson/logo codes are different identifiers.
    for(const branch of catalog.branches)if(!branch.profile&&norm(branch.sale)===norm(name)){branch.profile=url;report.branchProfilesLinked++;}
  }
}
if(process.argv.includes('--apply')){
  fs.writeFileSync(catalogFile,'const catalog='+JSON.stringify(catalog)+';\n');
  fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports/agent-logo-import.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify({...report,added:report.added.map(x=>x.name)},null,2));
