function folder_() {
  const settings = PropertiesService.getScriptProperties();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const id = settings.getProperty('galleryFolder');
    if (id) return DriveApp.getFolderById(id);
    const root = DriveApp.getRootFolder();
    const existing = root.getFoldersByName('LodaProvinceAgencyAPP');
    const folder = existing.hasNext() ? existing.next() : root.createFolder('LodaProvinceAgencyAPP');
    settings.setProperty('galleryFolder', folder.getId());
    return folder;
  } finally { lock.releaseLock(); }
}
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Gallery').setTitle('LODA').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function uploadImage(form) {
  const file = form.photo;
  const bytes = file.getBytes();
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw Error('ទំហំអតិបរមា 5 MB');
  const signature = bytes.slice(0,8).map(x=>x & 255).join(',');
  const png = signature === '137,80,78,71,13,10,26,10';
  if (!png && !signature.startsWith('255,216,255,')) throw Error('សូមជ្រើស PNG ឬ JPEG');
  file.setContentType(png ? 'image/png' : 'image/jpeg');
  const saved = folder_().createFile(file);
  try { saved.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW); }
  catch (e) { saved.setTrashed(true); throw e; }
  return saved.getName();
}
function listImages(token) {
  const folder = folder_();
  const files = token ? DriveApp.continueFileIterator(token) : folder.getFiles();
  const items = [];
  while (files.hasNext() && items.length < 30) {
    const file = files.next();
    if (!['image/png','image/jpeg'].includes(file.getMimeType())) continue;
    if (file.getSharingAccess() !== DriveApp.Access.ANYONE_WITH_LINK) continue;
    items.push({name:file.getName(),url:file.getUrl()});
  }
  return {items, next:files.hasNext()?files.getContinuationToken():''};
}
