const fs=require('node:fs'),path=require('node:path');const root=path.join(__dirname,'..');
for(const [source,target,tag] of [['site/preferences.js','drive/Preferences.html','script'],['site/theme.css','drive/Theme.html','style']]){
 const expected='<'+tag+'>\n'+fs.readFileSync(path.join(root,source),'utf8')+'\n</'+tag+'>\n';
 if(process.argv.includes('--check')){if(!fs.existsSync(path.join(root,target))||fs.readFileSync(path.join(root,target),'utf8')!==expected)throw Error('Run node scripts/sync-shared.cjs');}
 else fs.writeFileSync(path.join(root,target),expected);
}
