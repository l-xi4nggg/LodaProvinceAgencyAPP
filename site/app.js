'use strict';
const $=id=>document.getElementById(id), UI=window.LodaUI, t=UI.t;
const originalMedia=catalog.media.map(item=>({...item,id:'static:'+item.url}));
const originalBranches=catalog.branches.map((item,index)=>({...item,id:'branch:'+index}));
const categories=['Agency Profile','Content Poster','មុខទំនិញដែលអាចផុស','Video','Video ការប្រើប្រាស់ APP LODA'];
const initialView=new URLSearchParams(location.search).get('view');
let view=initialView==='shared'?'shared':initialView==='directory'?'directory':'library';
let category=initialView==='posters'?'Content Poster':'Agency Profile',limit=24,liveMedia=originalMedia,liveBranches=originalBranches,overrides={},selectedID='',frameLoaded=false;
const norm=value=>String(value||'').normalize('NFC').replace(/[\s\u200b]+/g,'').toLowerCase();
const provinceKey=value=>{const name=String(value||'').normalize('NFC').replace(/[\s\u200b-\u200d]+/g,'');return name==='ខេត្តកណ្តាល'?'ខេត្តកណ្ដាល':name;};
function el(tag,text){const node=document.createElement(tag);if(text)node.textContent=text;return node;}
function link(label,url){const node=el('a',label);node.href=url;node.className='action';return node;}
function picture(url,name){const node=el('img');node.src=url;node.alt=name;node.loading='lazy';return node;}
function actionButton(text,handler){const node=el('button',text);node.type='button';node.onclick=handler;return node;}
function mediaURL(item){return new URL(item.url,location.href).href;}
async function share(name,url){try{if(navigator.share)await navigator.share({title:name,url});else{await navigator.clipboard.writeText(url);$('status').textContent=t('copied');}}catch(error){if(error.name!=='AbortError')prompt(t('share'),url);}}
function profileFor(branch){const change=overrides['static:'+branch.profile];return change?.deleted?'':change?.thumbnail||change?.url||branch.profile;}
function card(item){
 const box=el('article');
 if(view==='directory'){
  box.className='branch-card';box.dataset.selected=String(selectedID===item.id);box.tabIndex=0;
  const image=profileFor(item);if(image){const node=picture(image,item.name);node.className='branch-photo';box.append(node);}
  box.append(el('small',[item.province,item.district].filter(Boolean).join(' · ')),el('h2',item.name+' · '+item.code),el('p',t('phone')+': '+(item.phone||'—')),el('p',t('salesperson')+': '+(item.sale||'—')));
  const controls=el('div');controls.className='media-actions';
  if(item.map){const open=link(t('openMap'),item.map);open.target='_blank';open.rel='noopener';open.onclick=event=>event.stopPropagation();controls.append(open);}
  controls.append(actionButton(t('map'),event=>{event.stopPropagation();selectBranch(item);}));box.append(controls);
  box.onclick=()=>selectBranch(item);box.onkeydown=event=>{if(event.key==='Enter'&&event.target===box)selectBranch(item);};
 }else{
  if(item.video&&item.preview){const frame=el('iframe');frame.src=item.preview;frame.title=item.name;frame.loading='lazy';frame.allowFullscreen=true;box.append(frame);}
  else if(item.video){const video=el('video');video.src=item.url;video.controls=true;video.preload='none';box.append(video);}else box.append(picture(item.thumbnail||item.url,item.name));
  box.append(el('h2',item.name));const actions=el('div');actions.className='media-actions';
  const download=link('↓ '+t('download'),item.download||item.url);download.download=item.file;actions.append(download,actionButton(t('share'),()=>share(item.name,mediaURL(item))));box.append(actions);
 }
 return box;
}
function rebuildProvinces(){const previous=$('province').value;$('province').replaceChildren(new Option(t('allProvinces'),''));for(const name of [...new Set(liveBranches.filter(x=>!x.deleted).map(x=>provinceKey(x.province)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'km')))$('province').add(new Option(name,name));$('province').value=previous;}
function mapOverview(){const url=new URL('https://www.google.com/maps/d/embed');url.searchParams.set('mid','1WCRIZfzhGtrID6W-3quJbmxNM3WzCJE');url.searchParams.set('hl',UI.lang);url.searchParams.set('ll','12.5657,104.991');url.searchParams.set('z','7');return url.href;}
function coordinates(item){if(item.lat!=null&&item.lng!=null&&Number.isFinite(Number(item.lat))&&Number.isFinite(Number(item.lng)))return [Number(item.lat),Number(item.lng)];const url=decodeURIComponent(item.map||'');let match=/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(url);if(!match)match=/(?:@|[?&]q=|\/maps\/search\/)(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(url);return match?[Number(match[1]),Number(match[2])]:null;}
function selectBranch(item){
 selectedID=item.id;const coords=coordinates(item);$('agencyMap').src=coords?'https://maps.google.com/maps?q='+encodeURIComponent(coords.join(','))+'&z=15&output=embed&hl='+UI.lang:mapOverview();
 $('selectedBranch').replaceChildren(el('h3',item.name+' · '+item.code),el('p',[item.province,item.district,item.phone].filter(Boolean).join(' · ')));
 if(item.map){const open=link(t('openMap'),item.map);open.target='_blank';open.rel='noopener';$('selectedBranch').append(open);}
 render();
 if(matchMedia('(max-width:850px)').matches&&item.map)window.open(item.map,'_blank','noopener');
}
function render(){
 const directory=view==='directory',shared=view==='shared';
 for(const key of ['library','directory','community'])$(key).setAttribute('aria-pressed',String(view===(key==='community'?'shared':key)));
 $('heading').textContent=t(directory?'directoryTitle':shared?'communityTitle':'libraryTitle');$('intro').textContent=t(directory?'directoryIntro':shared?'communityIntro':'libraryIntro');
 $('browseControls').hidden=shared;$('shared').hidden=!shared;$('directoryLayout').hidden=shared;$('directoryLayout').classList.toggle('map-layout',directory);$('mapPanel').hidden=!directory;$('province').hidden=!directory;
 $('filters').hidden=directory;$('query').placeholder=t(directory?'searchBranch':'searchMedia');$('query').setAttribute('aria-label',$('query').placeholder);
 $('filters').replaceChildren(...categories.map(key=>{const node=actionButton(t(key),()=>{category=key;limit=24;render();});node.setAttribute('aria-pressed',String(category===key));return node;}));
 const query=norm($('query').value),items=directory?liveBranches.filter(item=>!item.deleted&&(!$('province').value||provinceKey(item.province)===$('province').value)&&norm([item.name,item.code,item.sale,item.province,item.district].join(' ')).includes(query)):liveMedia.filter(item=>!item.deleted&&item.category===category&&norm(item.name).includes(query));
 $('results').classList.toggle('branches',directory);$('results').replaceChildren(...items.slice(0,limit).map(card));$('status').textContent=items.length+' '+t('results');$('empty').hidden=!!items.length;$('more').hidden=limit>=items.length;
 if(directory&&!$('agencyMap').getAttribute('src'))$('agencyMap').src=mapOverview();
 if(shared&&!frameLoaded){const url=new URL(sharedGalleryURL);url.searchParams.set('lang',UI.lang);url.searchParams.set('theme',UI.theme);url.searchParams.set('embed','1');$('sharedFrame').src=url.href;frameLoaded=true;}
}
function changeView(value){view=value;limit=24;$('query').value='';render();trackVisit(value==='shared'?'gallery':value);}
$('library').onclick=()=>changeView('library');$('directory').onclick=()=>changeView('directory');$('community').onclick=()=>changeView('shared');$('query').oninput=()=>{limit=24;render();};$('province').onchange=()=>{limit=24;render();};$('more').onclick=()=>{limit+=24;render();};
$('resetMap').onclick=()=>{selectedID='';$('agencyMap').src=mapOverview();$('selectedBranch').replaceChildren();render();};
if(sharedGalleryURL){const admin=new URL(sharedGalleryURL);admin.searchParams.set('view','admin');$('adminLink').href=admin.href;$('openShared').href=sharedGalleryURL;}
function syncEmbeddedPreferences(){if(!frameLoaded)return;const data={type:'loda:preferences',lang:UI.lang,theme:UI.theme};function send(frame,depth){if(depth>3)return;try{frame.postMessage(data,'*');for(let i=0;i<frame.frames.length;i++)send(frame.frames[i],depth+1);}catch(_){}}send($('sharedFrame').contentWindow,0);}
$('sharedFrame').onload=syncEmbeddedPreferences;
window.addEventListener('loda:preferences',()=>{rebuildProvinces();render();syncEmbeddedPreferences();if(view==='directory'&&!selectedID)$('agencyMap').src=mapOverview();});
let request='',timer,remoteMedia=[],script,generation=0;
function applySnapshot(snapshot){
 overrides=snapshot.overrides||{};const changes=snapshot.branchOverrides||{};liveBranches=originalBranches.map(item=>({...item,...changes[item.id]}));
 for(const [id,change]of Object.entries(changes))if(id.startsWith('new:')&&change.name)liveBranches.push({...change,id});
 const known=new Set(remoteMedia.map(item=>item.id));remoteMedia.push(...(snapshot.items||[]).filter(item=>!known.has(item.id)));liveMedia=[...originalMedia.map(item=>({...item,...overrides[item.id]})),...remoteMedia];rebuildProvinces();render();
}
function requestUpdates(page=''){
 if(!sharedGalleryURL)return;request=Date.now()+'-'+(++generation);const url=new URL(sharedGalleryURL);url.searchParams.set('mode','catalog');url.searchParams.set('request',request);if(page)url.searchParams.set('page',page);
 script?.remove();script=el('script');script.src=url.href;
 const fail=()=>{clearTimeout(timer);script?.remove();$('syncStatus').replaceChildren(el('span',t('syncError')+' '),actionButton(t('retry'),()=>{remoteMedia=[];requestUpdates();}));};script.onerror=fail;timer=setTimeout(fail,30000);document.body.append(script);
}
window.lodaCatalogUpdates=snapshot=>{if(snapshot.request!==request)return;clearTimeout(timer);script?.remove();applySnapshot(snapshot);$('syncStatus').textContent=snapshot.next?t('loading'):'';if(snapshot.next)requestUpdates(snapshot.next);};
function trackVisit(page){try{let session=sessionStorage.getItem('loda:visit');if(!session){session=crypto.randomUUID();sessionStorage.setItem('loda:visit',session);}const url=new URL(sharedGalleryURL);url.searchParams.set('mode','visit');url.searchParams.set('session',session);url.searchParams.set('event',crypto.randomUUID());url.searchParams.set('page',page);const beacon=el('script');beacon.src=url.href;beacon.onload=beacon.onerror=()=>beacon.remove();document.body.append(beacon);}catch(_){} }
rebuildProvinces();render();requestUpdates();trackVisit(view==='shared'?'gallery':view);
