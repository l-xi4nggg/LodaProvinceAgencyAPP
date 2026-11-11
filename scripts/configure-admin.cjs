const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const folder=path.join(__dirname,'../.local');fs.mkdirSync(folder,{recursive:true});
const file=path.join(folder,'properties.json');
process.stdout.write('Admin password (input hidden): ');
let input='';if(process.stdin.isTTY)process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');process.stdin.resume();
process.stdin.on('data',text=>{
  for(const char of text){
    if(char==='\u0003')process.exit(1);
    if(char==='\r'||char==='\n'){
      if(input.length<10||input.length>128){process.stdout.write('\nUse 10–128 characters.\n');process.exit(1);}
      const properties=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
      properties.ADMIN_SECRET=crypto.randomBytes(48).toString('base64url');
      properties.ADMIN_PASSWORD_HASH=crypto.createHmac('sha256',properties.ADMIN_SECRET).update('password:'+input).digest('base64').replace(/\+/g,'-').replace(/\//g,'_');
      input='';fs.writeFileSync(file,JSON.stringify(properties,null,2),{mode:0o600});
      process.stdout.write('\nAdmin password configured privately.\n');process.exit(0);
    }
    if(char==='\u007f'||char==='\b')input=input.slice(0,-1);else input+=char;
  }
});
