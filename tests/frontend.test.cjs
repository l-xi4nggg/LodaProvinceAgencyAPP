const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.attributes={};this.value='';this.hidden=false;this.disabled=false;this.files=[];this.checked=false;this._text='';}
  set textContent(text){this._text=String(text);this.children=[];}
  get textContent(){return this._text+this.children.map(child=>child.textContent||'').join('');}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this._text='';this.children=nodes;}
  setAttribute(key,value){this.attributes[key]=value;}
  removeAttribute(key){delete this.attributes[key];} addEventListener(){} load(){}
  add(option){const first=this.children.length===0;this.children.push(option);if(first)this.value=option.value;}
  querySelector(){return this.submit||(this.submit=new Element('button'));}
  showModal(){this.open=true;} close(){this.open=false;} reset(){} scrollIntoView(){}
}
const fixture=[{id:'static:media/0.webp',name:'រូបភាពថ្មី',category:'Content Poster',url:'https://example.com/0.webp',file:'0.webp',video:false},
  {id:'drive:uploaded-file',name:'Video sample',category:'shared',url:'https://drive.google.com/file/d/uploaded-file/view',preview:'https://drive.google.com/file/d/uploaded-file/preview',video:true}];
async function setup(admin=false, overrides={}){
  const calls=[], nodes={}, html=fs.readFileSync(path.join(__dirname,'../drive/Gallery.html'),'utf8');
  for(const match of html.matchAll(/<([\w]+)[^>]*\bid="([^"]+)"[^>]*>/g)){const node=new Element(match[1]);node.hidden=/\bhidden\b/.test(match[0]);nodes[match[2]]=node;}
  nodes.filterCategory.append(new Element('option'));
  const handlers={getPublicConfig:()=>({maxVideoBytes:1e9,maxVideoSeconds:30,maxImageBytes:20971520,chunkBytes:4194304,categories:['Content Poster','shared']}),listMedia:()=>({items:admin?[]:fixture,next:''}),getAdminCatalog:()=>({items:fixture}),loginAdmin:password=>{if(password!=='correct')throw Error('wrong password');return {token:'admin-test'};},updateMedia:()=>true,deleteMedia:()=>true,restoreStaticMedia:()=>true,...overrides};
  function runner(success,failure){return new Proxy({}, {get(_,name){if(name==='withSuccessHandler')return fn=>runner(fn,failure);if(name==='withFailureHandler')return fn=>runner(success,fn);return (...args)=>{calls.push({name,args});queueMicrotask(()=>{try{const result=handlers[name](...args);success(structuredClone(result));}catch(error){failure(error);}});};}});}
  const storage=new Map(),events={};
  const context=vm.createContext({console,URL,URLSearchParams,setTimeout,clearTimeout,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},FileReader:class{},Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value;}},
    document:{body:{dataset:{admin:String(admin)}},documentElement:{dataset:{},style:{}},querySelectorAll:()=>[],getElementById:id=>nodes[id],createElement:tag=>new Element(tag)},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},google:{script:{run:runner(()=>{},()=>{})}},navigator:{clipboard:{writeText:async text=>{calls.push({name:'clipboard',args:[text]});}}},location:{href:'https://example.com/gallery',search:''},window:{addEventListener(type,fn){(events[type]??=[]).push(fn);},dispatchEvent(event){for(const listener of events[event.type]||[])listener(event);}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../site/preferences.js'),'utf8'),context);
  const source=fs.readFileSync(path.join(__dirname,'../drive/Client.html'),'utf8').replace(/^<script>\s*/,'').replace(/<\/script>\s*$/,'');vm.runInContext(source,context);
  await new Promise(setImmediate);return {nodes,calls,context,storage,events};
}
function descendants(node){return [node,...node.children.flatMap(descendants)];}
async function login(env){env.nodes.password.value='correct';await env.nodes.loginForm.onsubmit({preventDefault(){}});}
test('public UI loads media without login and provides separate preview/download/share controls',async()=>{
  const env=await setup();assert.equal(env.calls.some(call=>call.name==='loginAdmin'),false);assert.equal(env.nodes.list.children.length,2);assert.equal(env.nodes.uploadButton.disabled,false);
  const first=env.nodes.list.children[0],share=descendants(first).find(node=>node.tag==='button'&&node.textContent==='ចែករំលែក');await share.onclick();
  assert.equal(env.calls.at(-1).name,'clipboard');assert.equal(env.calls.at(-1).args[0],fixture[0].url);
  assert.ok(descendants(env.nodes.list.children[1]).some(node=>node.tag==='iframe'&&node.title==='Video sample'));
});
test('public search, category filters and empty states update rendered media',async()=>{
  const {nodes}=await setup();nodes.search.value='Video';nodes.search.oninput();assert.equal(nodes.list.children.length,1);
  nodes.filterCategory.value='Content Poster';nodes.filterCategory.onchange();assert.equal(nodes.list.children.length,0);assert.equal(nodes.empty.hidden,false);
  nodes.search.value='';nodes.search.oninput();assert.equal(nodes.list.children.length,1);assert.equal(nodes.empty.hidden,true);
});
test('admin UI stays hidden until login; edit and delete invoke authorized backend calls',async()=>{
  const env=await setup(true),{nodes,calls}=env;assert.equal(nodes.workspace.hidden,true);assert.equal(nodes.loginPanel.hidden,false);assert.equal(calls.some(call=>call.name==='getAdminCatalog'),false);
  await login(env);assert.equal(nodes.workspace.hidden,false);assert.equal(nodes.loginPanel.hidden,true);
  const edit=descendants(nodes.list.children[0]).find(node=>node.tag==='button'&&node.textContent==='កែប្រែ');edit.onclick();assert.equal(nodes.editDialog.open,true);
  nodes.editName.value='កែឈ្មោះថ្មី';await nodes.editForm.onsubmit({preventDefault(){}});assert.equal(nodes.editDialog.open,false);
  const update=calls.find(call=>call.name==='updateMedia');assert.equal(update.args[0],'admin-test');assert.equal(update.args[2].name,'កែឈ្មោះថ្មី');
  const remove=descendants(nodes.list.children[0]).find(node=>node.tag==='button'&&node.textContent==='លុប');remove.onclick();await nodes.confirmDelete.onclick();
  assert.equal(calls.find(call=>call.name==='deleteMedia').args[0],'admin-test');assert.equal(nodes.list.children.length,1);
  nodes.showDeleted.checked=true;nodes.showDeleted.onchange();assert.equal(nodes.list.children.length,2);
});
test('failed login does not expose the admin workspace',async()=>{
  const env=await setup(true);env.nodes.password.value='wrong';await env.nodes.loginForm.onsubmit({preventDefault(){}});
  assert.equal(env.nodes.workspace.hidden,true);assert.equal(env.nodes.message.dataset.error,true);assert.equal(env.calls.some(call=>call.name==='getAdminCatalog'),false);
});
test('expired admin session returns to login without pretending an edit succeeded',async()=>{
  const env=await setup(true,{updateMedia(){throw Error('សូមចូល Admin ម្ដងទៀត');}});await login(env);
  descendants(env.nodes.list.children[0]).find(node=>node.tag==='button'&&node.textContent==='កែប្រែ').onclick();
  await env.nodes.editForm.onsubmit({preventDefault(){}});assert.equal(env.nodes.loginPanel.hidden,false);assert.equal(env.nodes.workspace.hidden,true);assert.equal(env.nodes.editDialog.open,false);assert.equal(env.nodes.message.dataset.error,true);
});
test('configuration failure leaves upload disabled and reports the error',async()=>{
  const {nodes}=await setup(false,{getPublicConfig(){throw Error('backend unavailable');}});assert.equal(nodes.uploadButton.disabled,true);assert.match(nodes.message.textContent,/backend unavailable/);
});
test('Khmer/light defaults and saved English/dark preferences update dynamic media controls',async()=>{
  const env=await setup(),ui=env.context.window.LodaUI;assert.equal(ui.lang,'km');assert.equal(ui.theme,'light');
  ui.set({lang:'en',theme:'dark'});assert.equal(env.storage.get('loda:lang'),'en');assert.equal(env.context.document.documentElement.dataset.theme,'dark');
  assert.ok(descendants(env.nodes.list.children[0]).some(node=>node.tag==='button'&&node.textContent==='Share'));
});
test('popup type selection opens the right constrained file picker and edit can replace a file',async()=>{
  const env=await setup(true);await login(env);env.nodes.newUpload.onclick();assert.equal(env.nodes.typeDialog.open,true);
  env.nodes.chooseVideo.onclick();assert.equal(env.nodes.typeDialog.open,false);assert.equal(env.nodes.uploadDialog.open,true);assert.match(env.nodes.mediaFile.accept,/video\/mp4/);
  env.nodes.closeUpload.onclick();descendants(env.nodes.list.children[0]).find(node=>node.tag==='button'&&node.textContent==='កែប្រែ').onclick();env.nodes.replaceFromEdit.onclick();
  assert.equal(env.nodes.editDialog.open,false);assert.equal(env.nodes.uploadDialog.open,true);assert.match(env.nodes.mediaFile.accept,/image\/png/);
});
test('embedded preference changes reject unrelated origins and accept only the configured parent',async()=>{
  const env=await setup(),ui=env.context.window.LodaUI,parent={};env.context.window.top=parent;env.context.document.body.dataset.parentOrigin='https://example.com';
  const event={origin:'https://evil.example',source:parent,data:{type:'loda:preferences',lang:'en',theme:'dark'}};
  for(const listener of env.events.message)listener(event);assert.equal(ui.lang,'km');
  for(const listener of env.events.message)listener({...event,origin:'https://example.com'});assert.equal(ui.lang,'en');assert.equal(ui.theme,'dark');
});
