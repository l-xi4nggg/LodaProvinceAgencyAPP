// Functions ending in _ are private to google.script.run.
const LODA = {
  maxVideoBytes: 1000000000, maxImageBytes: 20 * 1024 * 1024,
  maxVideoSeconds: 60, chunkBytes: 4 * 1024 * 1024,
  categories: ['Agency Profile', 'Content Poster', 'មុខទំនិញដែលអាចផុស', 'Video', 'Video ការប្រើប្រាស់ APP LODA', 'shared'],
  catalogURL: 'https://raw.githubusercontent.com/l-xi4nggg/LodaProvinceAgencyAPP/main/site/data.js',
  siteURL: 'https://l-xi4nggg.github.io/LodaProvinceAgencyAPP/',
  subcategories: ['activities', 'promotions', 'products', 'training', 'other', 'Agent Logo']
};
function locked_(fn) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function settings_() { return PropertiesService.getScriptProperties(); }
function folder_() {
  const existingID = settings_().getProperty('galleryFolder');
  if (existingID) return DriveApp.getFolderById(existingID);
  return locked_(function () {
    const id = settings_().getProperty('galleryFolder');
    if (id) return DriveApp.getFolderById(id);
    const folders = DriveApp.getRootFolder().getFoldersByName('LodaProvinceAgencyAPP');
    const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('LodaProvinceAgencyAPP');
    settings_().setProperty('galleryFolder', folder.getId()); return folder;
  });
}
function doGet(e) {
  const p = e && e.parameter || {};
  if (p.mode === 'visit') {
    recordVisit_(p.session, p.page, p.event);
    return ContentService.createTextOutput('void 0;').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  if (p.mode === 'catalog') {
    const page = listMedia(p.page || '', '');
    const snapshot = Object.assign(publicOverrides_(), page, { request: String(p.request || '').slice(0, 80) });
    return ContentService.createTextOutput('window.lodaCatalogUpdates(' + JSON.stringify(snapshot).replace(/</g, '\\u003c') + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  const template = HtmlService.createTemplateFromFile('Gallery');
  template.adminView = p.view === 'admin';
  template.initialLang = ['en','km'].indexOf(p.lang) >= 0 ? p.lang : '';
  template.initialTheme = ['dark','light'].indexOf(p.theme) >= 0 ? p.theme : '';
  template.embedded = p.embed === '1';
  template.parentOrigin = (settings_().getProperty('SITE_URL') || LODA.siteURL).match(/^https:\/\/[^/]+/)[0];
  template.homeURL = settings_().getProperty('SITE_URL') || LODA.siteURL;
  return template.evaluate().setTitle(p.view === 'admin' ? 'LODA · Admin' : 'LODA · ចែករំលែកមេឌៀ')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
function getPublicConfig() {
  return { maxVideoBytes: LODA.maxVideoBytes, maxImageBytes: LODA.maxImageBytes,
    maxVideoSeconds: LODA.maxVideoSeconds, chunkBytes: LODA.chunkBytes, categories: LODA.categories,
    subcategories: LODA.subcategories, analyticsEnabled: settings_().getProperty('ANALYTICS_ENABLED') === 'true' };
}
function cleanName_(name) {
  name = String(name || '').normalize('NFC').replace(/[\x00-\x1f\x7f/\\]/g, '').trim();
  if (!name || name.length > 120) throw Error('សូមដាក់ឈ្មោះពី 1 ដល់ 120 តួអក្សរ');
  return name;
}
function category_(value) {
  if (LODA.categories.indexOf(value) < 0) throw Error('ប្រភេទមិនត្រឹមត្រូវ'); return value;
}
function subcategory_(value) {
  const name = String(value || 'other').normalize('NFC').trim();
  if (!name || name.length > 60 || /[\x00-\x1f<>]/.test(name)) throw Error('Invalid subcategory');
  return name;
}
function driveRequest_(url, options) {
  options = options || {};
  options.headers = Object.assign({}, options.headers, { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() });
  options.muteHttpExceptions = true;
  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() >= 400) {
    console.error('Drive API status ' + response.getResponseCode());
    throw Error('Google Drive មិនអាចបំពេញសំណើបាន។ សូមព្យាយាមម្ដងទៀត ឬពិនិត្យទំហំផ្ទុក។');
  }
  return response;
}
function fileInGallery_(id, allowTrashed) {
  if (!/^[\w-]{10,200}$/.test(String(id))) throw Error('ឯកសារមិនត្រឹមត្រូវ');
  const file = DriveApp.getFileById(id);
  const parents = file.getParents(), folderID = folder_().getId(); let found = false;
  while (parents.hasNext()) if (parents.next().getId() === folderID) found = true;
  if (!found || (!allowTrashed && file.isTrashed())) throw Error('រកមិនឃើញឯកសារ'); return file;
}
function metadata_(file) {
  try { const data = JSON.parse(file.getDescription() || '{}'); return data.loda === 1 ? data : {}; }
  catch (_) { return {}; }
}
function mediaItem_(file) {
  const meta = metadata_(file), id = file.getId();
  return { id: 'drive:' + id, name: meta.name || file.getName(), file: file.getName(),
    category: meta.category || 'shared', subcategory: meta.subcategory || 'other', video: file.getMimeType().indexOf('video/') === 0,
    url: 'https://drive.google.com/file/d/' + id + '/view',
    preview: 'https://drive.google.com/file/d/' + id + '/preview',
    thumbnail: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w600',
    download: 'https://drive.google.com/uc?export=download&id=' + id,
    bytes: file.getSize(), replacementFor: meta.replacementFor || '', created: file.getDateCreated().toISOString() };
}
function listMedia(pageToken, adminToken) {
  if (adminToken) requireAdmin_(adminToken);
  const folder = folder_();
  let url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent("'" + folder.getId() + "' in parents and trashed = false") +
    '&pageSize=30&orderBy=createdTime%20desc&fields=nextPageToken,files(id)';
  if (pageToken) {
    if (typeof pageToken !== 'string' || pageToken.length > 4000) throw Error('ទំព័រមិនត្រឹមត្រូវ');
    url += '&pageToken=' + encodeURIComponent(pageToken);
  }
  const page = JSON.parse(driveRequest_(url).getContentText()), items = [];
  for (const entry of page.files || []) {
    const file = DriveApp.getFileById(entry.id), meta = metadata_(file), type = file.getMimeType();
    if (!/^(image\/(png|jpeg|webp)|video\/(mp4|quicktime|webm))$/.test(type)) continue;
    if (meta.pending || meta.replacementFor) continue;
    if (!adminToken && file.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) continue;
    items.push(mediaItem_(file));
  }
  return { items: items, next: page.nextPageToken || '' };
}
