const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
function read(file){const sandbox=vm.createContext({});vm.runInContext(fs.readFileSync(file,'utf8')+';globalThis.data=catalog',sandbox);return JSON.parse(JSON.stringify(sandbox.data));}
const original=read('D:/LODA/ChatGPT/LodaProvinceAgencyAPP/site/data.js'),current=read(path.join(root,'site/data.js'));
const norm=text=>String(text).normalize('NFC').replace(/[\s\u200b\u200c\u200d_-]+/g,'').toLowerCase();
const profiles=new Map(current.media.filter(item=>item.category==='Agency Profile').map(item=>[norm(item.name),item.url]));
let linked=0;const unmatched=[];
for(let i=0;i<original.branches.length;i++)if(!original.branches[i].profile){const branch=current.branches[i];if(branch.code!==original.branches[i].code)throw Error('Branch order changed');branch.profile=profiles.get(norm(branch.sale))||'';if(branch.profile)linked++;else unmatched.push({id:'branch:'+i,name:branch.name,sale:branch.sale});}
fs.writeFileSync(path.join(root,'site/data.js'),'const catalog='+JSON.stringify(current)+';\n');
const reportFile=path.join(root,'reports/agent-logo-import.json'),report=JSON.parse(fs.readFileSync(reportFile,'utf8'));report.branchProfilesLinked=linked;report.unmatchedBranches=unmatched;report.matching='Normalized full salesperson name only; warehouse codes are not logo codes.';fs.writeFileSync(reportFile,JSON.stringify(report,null,2));
console.log(JSON.stringify({linked,unmatched}));
