import json, pathlib

# 어디서 실행하든 같은 곳을 읽고 쓴다. 절대 경로를 박으면 만든 사람 계정명이
# 저장소에 남고, 다른 사람 기계에서는 그냥 깨진다.
HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[1]

data = json.loads((HERE / 'parts.json').read_text())
PARTS, OFFSETS = data['parts'], data['offsets']

LANCEL = {
 'PLUME':  (['....78','..7888','.78880','788...'], 4, 2),
 'HEAD':   (['...000000...','..01222220..','.0122222220.','012222BBB220',
             '012222222220','.01222222220','..012222220.','...004400...'], 9, 4),
 'TORSO':  (['.01222210.','0122222210','0122222210','0122222210','0123333210',
             '0123333210','0122222210','0122222210','.01222210.','0123333210'], 10, 12),
 'ARM_F':  (['4220','4220','4220','4220','4110','.00.'], 17, 15),
 'ARM_B':  (['0344','0344','0344','0344','0114','.00.'], 8, 15),
 'LEG_F':  (['4220','4220','4220','4330','4330','4330','4330'], 15, 22),
 'LEG_B':  (['0344','0344','0344','0334','0334','0334','0334'], 10, 22),
 'BOOT_F': (['42220','42220'], 15, 29),
 'BOOT_B': (['03444','03444'], 9, 29),
}
ORDER = ['ARM_B','LEG_B','BOOT_B','PLUME','TORSO','HEAD','LEG_F','BOOT_F','ARM_F']

html = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>캐른 — 보스 스프라이트 검수</title>
<style>
 body{margin:0;background:#0B0710;color:#EDE6D8;font:13px/1.6 ui-monospace,Menlo,monospace;padding:20px}
 h2{font-size:13px;color:#A99C8A;font-weight:400;letter-spacing:.1em;margin:24px 0 8px;text-transform:uppercase}
 .row{display:flex;gap:28px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px}
 .cell{text-align:center}
 canvas{image-rendering:pixelated;display:block;background:#120c18;border:1px solid #241C2E}
 .cap{color:#6B7385;font-size:11px;margin-top:4px}
</style></head><body>
<h2>합성 · 배율</h2><div class="row" id="scales"></div>
<h2>플레이어 대비 크기 (2배)</h2><div class="row" id="scale-cmp"></div>
<h2>페이즈 3 — 몸통 분해</h2><div class="row" id="phase3"></div>
<h2>파츠</h2><div class="row" id="parts"></div>
<script>
const PAL_CAIRN={'0':'#0B0710','1':'#8E97A8','2':'#6B7385','3':'#4A5163','4':'#2F3444',
 '5':'#EDE6D8','6':'#A99C8A','7':'#C9A6E8','8':'#8B4FD6','9':'#4A2278'};
const PAL_STEEL={'0':'#0B0710','1':'#EDF2FA','2':'#B9C6D8','3':'#8695AC','4':'#5F6E85',
 'B':'#2A2438','7':'#C23B4A','8':'#7E1F2C'};
const PARTS=__PARTS__, OFFSETS=__OFFSETS__, LANCEL=__LANCEL__, ORDER=__ORDER__;
function cv(w,h,px){const c=document.createElement('canvas');c.width=w*px;c.height=h*px;return c;}
function paint(ctx,rows,pal,px,ox,oy){
 rows.forEach((row,y)=>[...row].forEach((ch,x)=>{
  const col=pal[ch]; if(!col)return;
  ctx.fillStyle=col; ctx.fillRect((ox+x)*px,(oy+y)*px,px,px);}));}
function cairn(px,offs){
 const c=cv(56,52,px), ctx=c.getContext('2d');
 const o=offs||OFFSETS;
 paint(ctx,PARTS.BASE,PAL_CAIRN,px,o.BASE[0],o.BASE[1]);
 paint(ctx,PARTS.ARM_BACK,PAL_CAIRN,px,o.ARM_B[0],o.ARM_B[1]);
 paint(ctx,PARTS.TORSO,PAL_CAIRN,px,o.TORSO[0],o.TORSO[1]);
 paint(ctx,PARTS.CORE,PAL_CAIRN,px,o.CORE[0],o.CORE[1]);
 paint(ctx,PARTS.HEAD,PAL_CAIRN,px,o.HEAD[0],o.HEAD[1]);
 paint(ctx,PARTS.ARM,PAL_CAIRN,px,o.ARM_F[0],o.ARM_F[1]);
 return c;}
function lancel(px){const c=cv(32,32,px),ctx=c.getContext('2d');
 ORDER.forEach(k=>{const[p,x,y]=LANCEL[k];paint(ctx,p,PAL_STEEL,px,x,y);});return c;}
function add(host,el,cap){const d=document.createElement('div');d.className='cell';
 d.appendChild(el);const s=document.createElement('div');s.className='cap';s.textContent=cap;
 d.appendChild(s);document.getElementById(host).appendChild(d);}
[1,2,3,4].forEach(p=>add('scales',cairn(p),p+'배'));
add('scale-cmp',cairn(2),'캐른 56×52');
add('scale-cmp',lancel(2),'랜슬 32×32');
// 페이즈 3 — 파편이 흩어지고 코어가 드러난다
const ex={BASE:[0,40],TORSO:[11,16],HEAD:[16,-6],ARM_B:[-8,24],ARM_F:[50,10],CORE:[23,26]};
const c3=cv(72,64,3),x3=c3.getContext('2d');
paint(x3,PARTS.BASE,PAL_CAIRN,3,4,44);
paint(x3,PARTS.ARM_BACK,PAL_CAIRN,3,0,30);
paint(x3,PARTS.HEAD,PAL_CAIRN,3,22,0);
paint(x3,PARTS.ARM,PAL_CAIRN,3,58,20);
paint(x3,PARTS.CORE,PAL_CAIRN,3,29,28);
add('phase3',c3,'파편 4개 + 노출된 코어');
add('phase3',cairn(3),'재결합 상태');
Object.keys(PARTS).forEach(k=>{const rows=PARTS[k];
 const c=cv(rows[0].length,rows.length,4),ctx=c.getContext('2d');
 paint(ctx,rows,PAL_CAIRN,4,0,0);add('parts',c,k+' '+rows[0].length+'×'+rows.length);});
</script></body></html>"""

html = (html.replace('__PARTS__', json.dumps(PARTS))
            .replace('__OFFSETS__', json.dumps(OFFSETS))
            .replace('__LANCEL__', json.dumps(LANCEL))
            .replace('__ORDER__', json.dumps(ORDER)))
(REPO / 'docs' / 'cairn.html').write_text(html)
print('docs/cairn.html 생성')
