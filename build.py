from pathlib import Path
import json, re, shutil, sys, unicodedata
from openpyxl import load_workbook
from PIL import Image
src = Path(sys.argv[1])
out = Path(__file__).parent / 'site'
assets = out / 'media'
assets.mkdir(parents=True, exist_ok=True)
shutil.copyfile(src / 'Loda.png', out / 'Loda.png')
media = []
profiles = {}
def key(s):
    return re.sub(r'[\s\u200b]+', '', unicodedata.normalize('NFC', s)).casefold()
for folder in sorted(src.iterdir()):
    if not folder.is_dir() or folder.name not in ['Agency Profile','Content Poster','Video','Video ការប្រើប្រាស់ APP LODA','មុខទំនិញដែលអាចផុស']:
        continue
    for p in sorted(folder.rglob('*')):
        ext = p.suffix.lower()
        if ext not in ['.png','.jpg','.mov','.mp4']: continue
        video = ext in ['.mov','.mp4']
        ident = str(len(media))
        target = assets / (ident + (ext if video else '.webp'))
        if video: shutil.copyfile(p,target)
        else:
            with Image.open(p) as im:
                im.convert('RGB').save(target, quality=89, method=2)
        item = dict(name=p.stem, file=p.name if video else p.stem+'.webp', url='media/'+target.name, category=folder.name, video=video)
        media.append(item)
        if folder.name == 'Agency Profile': profiles[key(p.stem)] = item['url']
rows = load_workbook(src/'LODA Provincial Branches MAP.xlsx',read_only=True,data_only=True).worksheets[0].values
next(rows)
branches=[]
for row in rows:
    r=list(row)+[None]*16
    if not r[7] or r[8] is None: continue
    code=str(r[8]).removesuffix('.0')
    sale=str(r[15] or '').strip()
    branches.append(dict(name=str(r[7]).strip(),code=code,province=str(r[2] or ''),district=str(r[4] or ''),sale=sale,phone=' / '.join(str(x) for x in r[9:12] if x),map=str(r[13] or '') if str(r[13]).startswith('https://') else '',profile=profiles.get(key(sale),'') ))
(out/'data.js').write_text('const catalog='+json.dumps(dict(media=media,branches=branches),ensure_ascii=False)+';',encoding='utf8')
print(len(media),len(branches),sum(bool(b['profile']) for b in branches))

