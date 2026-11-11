function branchKey_(id) {
  if (!/^(branch:\d{1,8}|new:[a-f0-9-]{36})$/.test(String(id))) throw Error('Invalid branch ID');
  return 'branchOverride:' + id;
}
function branchOverrides_() {
  const props = settings_().getProperties(), result = {};
  Object.keys(props).filter(function (key) { return key.indexOf('branchOverride:') === 0; }).forEach(function (key) { result[key.slice(15)] = JSON.parse(props[key]); });
  return result;
}
function getAdminBranches(token) {
  requireAdmin_(token);
  const overrides = branchOverrides_(), catalog = sourceCatalog_();
  const items = (catalog.branches || []).map(function (branch, index) {
    const id = 'branch:' + index; return Object.assign({}, branch, { id: id }, overrides[id] || {});
  });
  Object.keys(overrides).filter(function (id) { return id.indexOf('new:') === 0; }).forEach(function (id) { items.push(Object.assign({}, overrides[id], { id: id })); });
  const base = (settings_().getProperty('SITE_URL') || LODA.siteURL).replace(/\/$/, '') + '/';
  return { items: items.map(function (item) { return Object.assign(item, { profilePreview: /^media\//.test(item.profile || '') ? base + item.profile : item.profile || '' }); }) };
}
function branchURL_(value, allowRelative) {
  value = String(value || '').trim();
  if (!value) return '';
  if (allowRelative && /^media\/\d+\.(png|jpe?g|webp)$/.test(value)) return value;
  if (value.length > 1500 || !/^https:\/\/[^\s<>"'\\]+$/i.test(value)) throw Error('Please use a valid HTTPS URL');
  return value;
}
function validateBranch_(input) {
  const result = {};
  for (const key of ['name','code','province','district','sale','phone']) {
    const value = String(input[key] || '').normalize('NFC').trim();
    if (value.length > (key === 'phone' ? 120 : 180) || /[\x00-\x1f]/.test(value)) throw Error('Branch field is too long or invalid');
    result[key] = value;
  }
  if (!result.name || !result.code || !result.province) throw Error('Name, code and province are required');
  result.map = branchURL_(input.map, false); result.profile = branchURL_(input.profile, true);
  if (input.lat !== '' && input.lat != null || input.lng !== '' && input.lng != null) {
    const lat = Number(input.lat), lng = Number(input.lng);
    if (input.lat === '' || input.lng === '' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw Error('Invalid map coordinates');
    result.lat = lat; result.lng = lng;
  } else { result.lat = null; result.lng = null; }
  return result;
}
function saveBranch(token, id, input) {
  requireAdmin_(token); const data = validateBranch_(input);
  id = id || 'new:' + Utilities.getUuid(); const key = branchKey_(id);
  if (id.indexOf('branch:') === 0 && Number(id.slice(7)) >= (sourceCatalog_().branches || []).length) throw Error('Branch not found');
  return locked_(function () {
    const previous = JSON.parse(settings_().getProperty(key) || '{}');
    const result = Object.assign(previous, data, { id: id });
    settings_().setProperty(key, JSON.stringify(result)); return result;
  });
}
function setBranchVisibility(token, id, hidden) {
  requireAdmin_(token); const key = branchKey_(id);
  return locked_(function () {
    const current = JSON.parse(settings_().getProperty(key) || '{}');
    if (id.indexOf('new:') === 0 && !current.name) throw Error('Branch not found');
    current.deleted = !!hidden; settings_().setProperty(key, JSON.stringify(current)); return true;
  });
}
