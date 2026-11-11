const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
for (const name of fs.readdirSync(path.join(root, 'drive')).filter(name => name.endsWith('.gs'))) {
  new vm.Script(fs.readFileSync(path.join(root, 'drive', name), 'utf8'), {filename: name});
}
for (const relative of ['site/app.js', 'site/config.js', 'site/data.js', 'site/preferences.js']) new vm.Script(fs.readFileSync(path.join(root, relative), 'utf8'), {filename: relative});
const client = fs.readFileSync(path.join(root, 'drive/Client.html'), 'utf8').replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, '');
new vm.Script(client, {filename: 'Client.html'});
for(const name of ['Management','Preferences'])new vm.Script(fs.readFileSync(path.join(root,'drive',name+'.html'),'utf8').replace(/^<script>\s*/,'').replace(/<\/script>\s*$/,''),{filename:name+'.html'});
require('node:child_process').execFileSync(process.execPath,[path.join(root,'scripts/sync-shared.cjs'),'--check']);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'drive/appsscript.json'), 'utf8'));
if (manifest.runtimeVersion !== 'V8') throw Error('Apps Script V8 is required');
const gallery = fs.readFileSync(path.join(root, 'drive/Gallery.html'), 'utf8');
const ids = [...gallery.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
if (new Set(ids).size !== ids.length) throw Error('Duplicate HTML IDs');
for (const match of client.matchAll(/\$\('([^']+)'\)/g)) if (!ids.includes(match[1])) throw Error('Missing HTML ID: ' + match[1]);
const context = vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(root, 'site/data.js'), 'utf8') + ';globalThis.data=catalog', context);
for (const item of context.data.media) if (!fs.existsSync(path.join(root, 'site', item.url))) throw Error('Missing media: ' + item.url);
console.log('Syntax, Apps Script manifest, template references, HTML IDs, and ' + context.data.media.length + ' media files verified.');
