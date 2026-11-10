const $ = id => document.getElementById(id);
const labels={'Agency Profile':'ប្រូហ្វាល់ភ្នាក់ងារ','Content Poster':'រូបភាពសម្រាប់ផុស','មុខទំនិញដែលអាចផុស':'រូបភាពទំនិញ','Video':'វីដេអូ','Video ការប្រើប្រាស់ APP LODA':'វីដេអូណែនាំ','shared':'ភ្នាក់ងារចែកចាយរូបភាព'};
let branch=false,category='Agency Profile',limit=24;
const norm=s=>s.normalize('NFC').replace(/[\s\u200b]+/g,'').toLowerCase();
function el(tag,text){const node=document.createElement(tag);if(text)node.textContent=text;return node}
function link(label,url){const a=el('a',label);a.href=url;a.className='action';return a}
function picture(url,name){const i=el('img');i.loading='lazy';i.src=url;i.alt=name;return i}
function card(item){
 const box=el('article');
 if(branch){
  if(item.profile){const a=link('',item.profile);a.className='side';a.download=item.sale+'.webp';a.append(picture(item.profile,item.sale));box.append(a)}
  box.append(el('small',[item.province,item.district].filter(Boolean).join(' · ')),el('h2',item.name+'-'+item.code),el('p','លេខទំនាក់ទំនង៖ '+(item.phone||'—')),el('p','Saleman: '+(item.sale||'—')));
  if(item.map){const b=el('button','ចែករំលែកផែនទី');b.onclick=async()=>{try{if(navigator.share)await navigator.share({title:item.name,url:item.map});else{await navigator.clipboard.writeText(item.map);b.textContent='បានចម្លងតំណ'}}catch(e){if(e.name!=='AbortError')prompt('តំណផែនទី',item.map)}};box.append(b)}
 }else{
  if(item.video){const v=el('video');v.controls=true;v.preload='none';v.src=item.url;box.append(v)}else box.append(picture(item.url,item.name));
  const a=link('ទាញយក ↓',item.url);a.download=item.file;box.append(el('h2',item.name),a)
 }
 return box
}
function render(){
 $('library').setAttribute('aria-pressed',!branch);$('directory').setAttribute('aria-pressed',branch);
 $('heading').textContent=branch?'ទីតាំងភ្នាក់ងារឡូដា':'បណ្ណាល័យរូបភាព និងវីដេអូ';
 $('query').placeholder=branch?'ស្វែងរកឈ្មោះទីតាំង កូដឃ្លាំង ឬផ្នែកអ្នកលក់':'ស្វែងរកតាមរយៈផ្នែកអ្នកលក់ "saleman"';
 $('query').setAttribute('aria-label',$('query').placeholder);
 $('filters').hidden=branch;const shared=!branch&&category==='shared';$('shared').hidden=!shared;$('query').hidden=shared;
 for(const b of $('filters').children)b.setAttribute('aria-pressed',b.value===category);
 const q=norm($('query').value);const items=(branch?catalog.branches:catalog.media).filter(x=>(branch||x.category===category)&&norm(branch?[x.name,x.code,x.sale,x.province,x.district].join(' '):x.name).includes(q));
 $('status').textContent=shared?'':items.length+' លទ្ធផល';$('results').classList.toggle('branches',branch);$('results').replaceChildren(...items.slice(0,limit).map(card));$('more').hidden=limit>=items.length
}
for(const [key,title] of Object.entries(labels)){const b=el('button',title);b.value=key;b.onclick=()=>{category=key;reset()};$('filters').append(b)}
function reset(){$('query').value='';limit=24;render()}
$('library').onclick=()=>{branch=false;reset()};$('directory').onclick=()=>{branch=true;reset()};$('query').oninput=()=>{limit=24;render()};$('more').onclick=()=>{limit+=24;render()};
if(sharedGalleryURL){const f=el('iframe');f.title=labels.shared;f.src=sharedGalleryURL;$('shared').append(f)}else $('shared').textContent='ការចែកចាយរូបភាពកំពុងរង់ចាំភ្ជាប់ Google Drive។';
render();
