// Optional aggregate counts, not an exact count of individual people.
function recordVisit_(session, page, event) {
  if (settings_().getProperty('ANALYTICS_ENABLED') !== 'true') return;
  if (!/^[\w-]{16,80}$/.test(String(session)) || !/^[\w-]{16,80}$/.test(String(event))) return;
  if (['library','directory','gallery'].indexOf(page) < 0) return;
  return locked_(function () {
    const cache = CacheService.getScriptCache(), date = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
    const eventKey = 'event:' + digest_(event);
    if (cache.get(eventKey)) return;
    cache.put(eventKey, '1', 21600);
    const key = 'stats:' + date, stats = JSON.parse(settings_().getProperty(key) || '{"views":0,"visits":0,"pages":{}}');
    const sessionKey = 'visit:' + date + ':' + digest_(session);
    if (!cache.get(sessionKey)) { stats.visits++; cache.put(sessionKey, '1', 21600); }
    stats.views++; stats.pages[page] = (stats.pages[page] || 0) + 1;
    settings_().setProperty(key, JSON.stringify(stats));
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    Object.keys(settings_().getProperties()).filter(function (k) { return k.indexOf('stats:') === 0 && k.slice(6) < cutoff; }).forEach(function (k) { settings_().deleteProperty(k); });
  });
}
function getAdminAnalytics(token) {
  requireAdmin_(token); const props = settings_().getProperties();
  const cutoff = Utilities.formatDate(new Date(Date.now() - 29 * 86400000), 'Asia/Bangkok', 'yyyy-MM-dd');
  return { enabled: props.ANALYTICS_ENABLED === 'true', days: Object.keys(props).filter(function (key) { return key.indexOf('stats:') === 0 && key.slice(6) >= cutoff; }).sort().slice(-30).map(function (key) { return Object.assign({ date: key.slice(6) }, JSON.parse(props[key])); }) };
}
function recordGalleryVisit(session, event) { recordVisit_(session, 'gallery', event); return true; }
