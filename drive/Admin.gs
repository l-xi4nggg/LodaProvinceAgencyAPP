function adminSecret_() {
  const secret = settings_().getProperty('ADMIN_SECRET') || '';
  if (secret.length < 32) throw Error('Admin មិនទាន់បានកំណត់។ សូមកំណត់ ADMIN_SECRET យ៉ាងតិច 32 តួអក្សរ ក្នុង Script Properties។');
  return secret;
}
function digest_(text) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text)); }
function equal_(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function sign_(payload) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, adminSecret_())); }
function setAdminPassword_(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) throw Error('Password must contain 10–128 characters');
  if (!settings_().getProperty('ADMIN_SECRET')) settings_().setProperty('ADMIN_SECRET', Utilities.getUuid() + Utilities.getUuid());
  settings_().setProperty('ADMIN_PASSWORD_HASH', sign_('password:' + password));
}
function loginAdmin(password) {
  return locked_(function () {
    const cache = CacheService.getScriptCache(), key = 'admin-login-attempts';
    const attempts = Number(cache.get(key) || 0);
    if (attempts >= 10) throw Error('សូមរង់ចាំ 10 នាទី មុនសាកល្បងម្ដងទៀត');
    const hash = settings_().getProperty('ADMIN_PASSWORD_HASH');
    const valid = typeof password === 'string' && password.length <= 512 &&
      (hash ? equal_(sign_('password:' + password), hash) : equal_(digest_(password), digest_(adminSecret_())));
    if (!valid) {
      cache.put(key, String(attempts + 1), 600); throw Error('ពាក្យសម្ងាត់មិនត្រឹមត្រូវ');
    }
    cache.remove(key);
    const payload = String(Date.now() + 2 * 60 * 60 * 1000) + ':' + Utilities.getUuid();
    return { token: payload + '.' + sign_(payload), expires: Number(payload.split(':')[0]) };
  });
}
function requireAdmin_(token) {
  if (typeof token !== 'string' || token.length > 256) throw Error('សូមចូល Admin ម្ដងទៀត');
  const parts = token.split('.');
  if (parts.length !== 2 || !/^\d+:[-\w]+$/.test(parts[0]) || Number(parts[0].split(':')[0]) <= Date.now() || !equal_(sign_(parts[0]), parts[1])) throw Error('សូមចូល Admin ម្ដងទៀត');
}
function sourceCatalog_() {
  const url = settings_().getProperty('CATALOG_URL') || LODA.catalogURL;
  if (!/^https:\/\//.test(url)) throw Error('CATALOG_URL ត្រូវជា HTTPS');
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw Error('មិនអាចអានបណ្ណាល័យដើមបាន។ សូមពិនិត្យ CATALOG_URL។');
  const raw = response.getContentText().replace(/^\s*const catalog\s*=\s*/, '').replace(/;\s*$/, '');
  return JSON.parse(raw);
}
function staticCatalog_() {
  const catalog = sourceCatalog_(), base = settings_().getProperty('SITE_URL') || LODA.siteURL;
  if (!/^https:\/\//.test(base)) throw Error('SITE_URL ត្រូវជា HTTPS');
  return catalog.media.map(function (item) {
    if (!/^media\/\d+\.(webp|png|jpg|jpeg|mov|mp4)$/.test(item.url)) throw Error('ទិន្នន័យមេឌៀមិនត្រឹមត្រូវ');
    return Object.assign({}, item, { id: 'static:' + item.url, url: base.replace(/\/$/, '') + '/' + item.url });
  });
}
function overrideKey_(id) {
  if (!/^static:media\/\d+\.(webp|png|jpg|jpeg|mov|mp4)$/.test(id)) throw Error('មេឌៀមិនត្រឹមត្រូវ'); return 'override:' + id;
}
function publicOverrides_() {
  const props = settings_().getProperties(), overrides = {};
  Object.keys(props).filter(function (key) { return key.indexOf('override:') === 0; }).forEach(function (key) { overrides[key.slice(9)] = JSON.parse(props[key]); });
  return { overrides: overrides, branchOverrides: branchOverrides_() };
}
function getAdminCatalog(token) {
  requireAdmin_(token); const overrides = publicOverrides_().overrides;
  return { items: staticCatalog_().map(function (item) { return Object.assign({}, item, overrides[item.id] || {}); }) };
}
function updateMedia(token, id, changes) {
  requireAdmin_(token); const name = cleanName_(changes.name), category = category_(changes.category), subcategory = subcategory_(changes.subcategory);
  if (id.indexOf('static:') === 0) {
    const key = overrideKey_(id);
    return locked_(function () {
      const current = JSON.parse(settings_().getProperty(key) || '{}');
      settings_().setProperty(key, JSON.stringify(Object.assign(current, { name: name, category: category, subcategory: subcategory }))); return true;
    });
  }
  if (id.indexOf('drive:') !== 0) throw Error('មេឌៀមិនត្រឹមត្រូវ');
  const file = fileInGallery_(id.slice(6)), meta = metadata_(file);
  file.setName(name + extension_(file.getMimeType()));
  file.setDescription(JSON.stringify(Object.assign(meta, { loda: 1, name: name, category: category, subcategory: subcategory }))); return true;
}
function deleteMedia(token, id) {
  requireAdmin_(token);
  if (id.indexOf('static:') === 0) return locked_(function () {
    const key = overrideKey_(id), current = JSON.parse(settings_().getProperty(key) || '{}');
    settings_().setProperty(key, JSON.stringify(Object.assign(current, { deleted: true }))); return true;
  });
  if (id.indexOf('drive:') !== 0) throw Error('មេឌៀមិនត្រឹមត្រូវ');
  fileInGallery_(id.slice(6)).setTrashed(true); return true;
}
function restoreStaticMedia(token, id) {
  requireAdmin_(token);
  return locked_(function () {
    const key = overrideKey_(id), current = JSON.parse(settings_().getProperty(key) || '{}');
    current.deleted = false; settings_().setProperty(key, JSON.stringify(current)); return true;
  });
}
