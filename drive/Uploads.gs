function extension_(mime) {
  const extensions = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm' };
  if (!extensions[mime]) throw Error('សូមជ្រើស PNG, JPEG, WebP, MP4, MOV ឬ WebM');
  return extensions[mime];
}
function validateUpload_(input) {
  const name = cleanName_(input.name), extension = extension_(input.mime);
  const video = input.mime.indexOf('video/') === 0, size = Number(input.size);
  if (!Number.isSafeInteger(size) || size <= 0 || (video ? size >= LODA.maxVideoBytes : size > LODA.maxImageBytes)) throw Error(video ? 'វីដេអូត្រូវតិចជាង 1 GB' : 'រូបភាពអតិបរមា 20 MB');
  if (video && (!Number.isFinite(input.duration) || input.duration <= 0 || input.duration >= LODA.maxVideoSeconds)) throw Error('វីដេអូត្រូវក្រោម 60 វិនាទី');
  return { name: name, extension: extension, mime: input.mime, size: size, video: video };
}
function sessionKey_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9-]{72}$/.test(token)) throw Error('Upload មិនត្រឹមត្រូវ');
  return 'upload:' + digest_(token);
}
function loadUpload_(token, adminToken) {
  const raw = settings_().getProperty(sessionKey_(token));
  if (!raw) throw Error('Upload ផុតកំណត់។ សូមចាប់ផ្ដើមម្ដងទៀត');
  const session = JSON.parse(raw);
  if (session.expires < Date.now()) throw Error('Upload ផុតកំណត់។ សូមចាប់ផ្ដើមម្ដងទៀត');
  if (session.admin) requireAdmin_(adminToken);
  return session;
}
function saveUpload_(token, session) { settings_().setProperty(sessionKey_(token), JSON.stringify(session)); }
function stagingFolder_() {
  const id = settings_().getProperty('stagingFolder');
  if (id) return DriveApp.getFolderById(id);
  return locked_(function () {
    const current = settings_().getProperty('stagingFolder');
    if (current) return DriveApp.getFolderById(current);
    const folder = DriveApp.createFolder('LODA-private-upload-staging');
    settings_().setProperty('stagingFolder', folder.getId()); return folder;
  });
}
function uploadFile_(session) {
  const file = DriveApp.getFileById(session.fileID), parents = file.getParents(); let found = false;
  const staging = settings_().getProperty('stagingFolder'), gallery = settings_().getProperty('galleryFolder');
  while (parents.hasNext()) { const id = parents.next().getId(); if (id === staging || id === gallery) found = true; }
  if (!found || file.isTrashed()) throw Error('រកមិនឃើញឯកសារ Upload'); return file;
}
function beginUpload(input, adminToken) {
  const valid = validateUpload_(input), admin = !!adminToken;
  if (admin) requireAdmin_(adminToken);
  if (!admin && (input.replaceID || input.branchID || input.category && input.category !== 'shared')) throw Error('ត្រូវការសិទ្ធិ Admin');
  const category = admin ? category_(input.category || 'shared') : 'shared';
  const subcategory = subcategory_(input.subcategory);
  const branchID = String(input.branchID || '');
  if (branchID) { branchKey_(branchID); if (valid.video) throw Error('Branch profile must be an image');
    if (!getAdminBranches(adminToken).items.some(function (item) { return item.id === branchID; })) throw Error('Branch not found');
  }
  const replaceID = String(input.replaceID || '');
  if (replaceID) {
    if (replaceID.indexOf('static:') === 0) overrideKey_(replaceID);
    else if (replaceID.indexOf('drive:') === 0) fileInGallery_(replaceID.slice(6));
    else throw Error('មេឌៀមិនត្រឹមត្រូវ');
  }
  folder_();
  const folderID = stagingFolder_().getId();
  return locked_(function () {
    const props = settings_().getProperties(); let active = 0;
    Object.keys(props).filter(function (key) { return key.indexOf('upload:') === 0; }).forEach(function (key) {
      const session = JSON.parse(props[key]);
      if (session.expires < Date.now()) {
        if (!session.done && session.fileID) {
          try { uploadFile_(session).setTrashed(true); } catch (error) { console.error('Stale upload cleanup failed'); }
        }
        settings_().deleteProperty(key);
      }
      else if (!session.done) active++;
    });
    if (active >= 30) throw Error('មាន Upload ច្រើនកំពុងដំណើរការ។ សូមព្យាយាមម្ដងទៀតបន្តិចទៀត');
    const description = { loda: 1, pending: true, name: valid.name, category: category, subcategory: subcategory,
      replacementFor: branchID ? 'branch:' + branchID : replaceID.indexOf('static:') === 0 ? replaceID : '' };
    const response = driveRequest_('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,size,mimeType,videoMediaMetadata', {
      method: 'post', contentType: 'application/json',
      headers: { 'X-Upload-Content-Type': valid.mime, 'X-Upload-Content-Length': String(valid.size) },
      payload: JSON.stringify({ name: valid.name + valid.extension, parents: [folderID], mimeType: valid.mime, description: JSON.stringify(description) })
    });
    const headers = response.getAllHeaders(), locationKey = Object.keys(headers).find(function (key) { return key.toLowerCase() === 'location'; });
    const location = locationKey && headers[locationKey];
    if (!/^https:\/\/www\.googleapis\.com\/upload\//.test(String(location))) throw Error('មិនអាចចាប់ផ្ដើម Upload បាន');
    const token = Utilities.getUuid() + Utilities.getUuid();
    saveUpload_(token, Object.assign(valid, { location: location, offset: 0, admin: admin, category: category, subcategory: subcategory, branchID: branchID, replaceID: replaceID,
      expires: Date.now() + 6 * 60 * 60 * 1000 }));
    return { token: token, offset: 0, chunkBytes: LODA.chunkBytes };
  });
}
function signatureOK_(bytes, mime) {
  const b = bytes.slice(0, 16).map(function (v) { return v & 255; });
  if (mime === 'image/png') return b.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  if (mime === 'image/jpeg') return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (mime === 'image/webp') return String.fromCharCode.apply(null, b.slice(0, 4)) === 'RIFF' && String.fromCharCode.apply(null, b.slice(8, 12)) === 'WEBP';
  if (mime === 'video/webm') return b.slice(0, 4).join(',') === '26,69,223,163';
  const atom = String.fromCharCode.apply(null, b.slice(4, 8));
  return mime === 'video/quicktime' ? ['ftyp', 'moov', 'mdat', 'wide'].indexOf(atom) >= 0 : atom === 'ftyp';
}
function uploadChunk(token, offset, base64, adminToken) {
  if (typeof base64 !== 'string' || base64.length > Math.ceil(LODA.chunkBytes / 3) * 4) throw Error('បំណែក Upload ធំពេក');
  return locked_(function () {
    const session = loadUpload_(token, adminToken);
    if (session.done) return { done: true, offset: session.size, item: session.item };
    if (session.fileID) return finalizeUpload_(token, session);
    if (!Number.isSafeInteger(offset) || offset !== session.offset) return { offset: session.offset, done: false };
    const bytes = Utilities.base64Decode(base64), remaining = session.size - offset;
    if (!bytes.length || bytes.length > LODA.chunkBytes || bytes.length > remaining || (bytes.length < remaining && bytes.length % (256 * 1024) !== 0)) throw Error('ទំហំបំណែក Upload មិនត្រឹមត្រូវ');
    if (offset === 0 && !signatureOK_(bytes, session.mime)) throw Error('ប្រភេទឯកសារមិនត្រូវនឹងមាតិកា');
    const response = driveRequest_(session.location, {
      method: 'put', contentType: session.mime, payload: bytes, followRedirects: false,
      headers: { 'Content-Range': 'bytes ' + offset + '-' + (offset + bytes.length - 1) + '/' + session.size }
    });
    return uploadResponse_(token, session, response);
  });
}
function uploadResponse_(token, session, response) {
  const code = response.getResponseCode();
  if (code === 308) {
    const headers = response.getAllHeaders(), key = Object.keys(headers).find(function (k) { return k.toLowerCase() === 'range'; });
    const range = String(key ? headers[key] : ''), match = /^bytes=0-(\d+)$/.exec(range);
    session.offset = match ? Number(match[1]) + 1 : 0;
    if (session.offset > session.size) throw Error('ចម្លើយ Upload មិនត្រឹមត្រូវ');
    saveUpload_(token, session); return { offset: session.offset, done: false };
  }
  if (code !== 200 && code !== 201) throw Error('Upload មិនបានជោគជ័យ');
  const data = JSON.parse(response.getContentText());
  if (!data.id) throw Error('រកមិនឃើញឯកសារ Upload');
  session.fileID = data.id; session.offset = session.size;
  saveUpload_(token, session); return finalizeUpload_(token, session);
}
function finalizeUpload_(token, session) {
  const file = uploadFile_(session);
  if (session.video && !session.durationVerified) {
    // Staging must remain private even when the published gallery folder is shared.
    if (file.getSharingAccess() !== DriveApp.Access.PRIVATE) throw Error('សូមរក្សា staging folder ជាឯកជន');
  }
  if (file.getSize() !== session.size) throw Error('ទំហំឯកសារមិនត្រូវគ្នា');
  if (session.video && !session.durationVerified) {
    const response = driveRequest_('https://www.googleapis.com/drive/v3/files/' + session.fileID + '?fields=videoMediaMetadata');
    const meta = JSON.parse(response.getContentText()), duration = Number(meta.videoMediaMetadata && meta.videoMediaMetadata.durationMillis);
    // Never publish until Drive independently confirms the duration.
    if (!Number.isFinite(duration) || duration <= 0) return { offset: session.size, processing: true, done: false };
    if (duration >= LODA.maxVideoSeconds * 1000) {
      file.setTrashed(true); settings_().deleteProperty(sessionKey_(token)); throw Error('វីដេអូត្រូវក្រោម 60 វិនាទី មិនអាចចែករំលែកបាន');
    }
    session.durationVerified = true; saveUpload_(token, session);
  }
  const meta = metadata_(file); meta.pending = false;
  file.setDescription(JSON.stringify(meta));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (error) { meta.pending = true; file.setDescription(JSON.stringify(meta)); throw error; }
  const item = mediaItem_(file);
  file.moveTo(folder_());
  if (session.replaceID.indexOf('static:') === 0) {
    const key = overrideKey_(session.replaceID), old = JSON.parse(settings_().getProperty(key) || '{}');
    settings_().setProperty(key, JSON.stringify(Object.assign(old, {
      name: session.name, category: session.category, subcategory: session.subcategory, url: item.url, preview: item.preview,
      thumbnail: item.thumbnail, download: item.download, video: item.video, file: item.file
    })));
  } else if (session.replaceID) fileInGallery_(session.replaceID.slice(6), true).setTrashed(true);
  if (session.branchID) {
    const key = branchKey_(session.branchID), current = JSON.parse(settings_().getProperty(key) || '{}');
    current.profile = item.thumbnail; current.profileDownload = item.download;
    settings_().setProperty(key, JSON.stringify(current));
  }
  session.done = true; session.item = item; saveUpload_(token, session);
  return { done: true, offset: session.size, item: item };
}
function getUploadStatus(token, adminToken) {
  return locked_(function () {
    const session = loadUpload_(token, adminToken);
    if (session.done) return { done: true, offset: session.size, item: session.item };
    if (session.fileID) return finalizeUpload_(token, session);
    const response = driveRequest_(session.location, { method: 'put', payload: '', followRedirects: false, headers: { 'Content-Range': 'bytes */' + session.size } });
    return uploadResponse_(token, session, response);
  });
}
function cancelUpload(token, adminToken) {
  return locked_(function () {
    const session = loadUpload_(token, adminToken);
    if (session.done) return false;
    if (session.fileID) uploadFile_(session).setTrashed(true);
    settings_().deleteProperty(sessionKey_(token)); return true;
  });
}
