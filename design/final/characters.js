// NOVA Brawl: final fighter designs (reference for the build).
// build(cfg, mainColour) returns an SVG drawing of a fighter; sprite() renders it to an 81 px tall
// pixel sprite: downscale, snap to a fixed palette (3 tones per colour), add a 1 px dark outline.
// The fighter's own colour is `color`. If two players pick the same fighter, the later player's
// top garment is drawn in their player colour instead (pass that colour as mainColour).

const INK='#16122a', WHITE='#eef3f8';
const hex=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
const toHex=a=>'#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
const shade=(c,t)=>toHex(hex(c).map(v=>t>0?v+(255-v)*t:v*(1+t)));
const FLAT=[INK,WHITE,'#f6c343','#d6336c','#1f9d55','#e63946','#3a3550','#8a8f9c'];

function build(c,M){
  const used=new Map(), g=h=>{if(!used.has(h))used.set(h,'g'+used.size);return `url(#${used.get(h)})`};
  const bw={slim:42,normal:50,buff:62}[c.build||'normal'], aw=c.build==='buff'?17:12, hx=bw/2+13;
  const skin=c.skin||'#f7c9a3', [hs,hc]=c.hair, [lt,lc0]=c.legs||['trousers','#2b2740'], lc=lc0==='M'?M:lc0;
  const X=c.extras||[], has=k=>X.includes(k), top=c.top, shirt='#cfe3f7';
  const face=`stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"`;
  const longSleeve=['suit','hoodie','wetsuit','gilet','openshirt','blazer'].includes(top), armCol=top==='gilet'?shirt:M;
  const armFill=longSleeve?g(armCol):g(skin);
  let s='';
  // back layer
  if(hs==='wavy'){s+=`<rect x="-42" y="-122" width="84" height="88" rx="28" fill="${g(hc)}"/>`;for(let k=-3;k<=3;k++)s+=`<circle cx="${k*12}" cy="-36" r="9" fill="${g(hc)}"/>`;}
  if(hs==='highpony')s+=`<path d="M-6,-136 q-44,-16 -52,34 q-4,32 8,52 q4,-30 14,-46 q10,-14 30,-30z" fill="${g(hc)}"/>`;
  if(top==='hoodie')s+=`<ellipse cx="0" cy="-99" rx="39" ry="40" fill="${g(M)}"/>`;
  if(hs==='long')s+=`<rect x="-37" y="-118" width="74" height="80" rx="22" fill="${g(hc)}"/>`;
  if(hs==='bob')s+=`<rect x="-39" y="-120" width="78" height="52" rx="20" fill="${g(hc)}"/>`;
  if(hs==='mullet')s+=`<rect x="-31" y="-106" width="62" height="48" rx="14" fill="${g(hc)}"/>`;
  if(hs==='ponytail')s+=`<path d="M-24,-118 q-36,4 -36,42 q15,-7 19,-24 q11,-4 17,-18z" fill="${g(hc)}"/>`;
  // legs
  const legFill=lt==='trousers'?g(lc):g(skin);
  s+=`<rect x="-17" y="-36" width="13" height="32" rx="4" fill="${legFill}"/><rect x="4" y="-36" width="13" height="32" rx="4" fill="${legFill}"/>`;
  if(lt==='shorts')s+=`<rect x="-18" y="-38" width="15" height="17" rx="4" fill="${g(lc)}"/><rect x="3" y="-38" width="15" height="17" rx="4" fill="${g(lc)}"/>`;
  if(lt==='skirt')s+=`<polygon points="${-bw/2},-44 ${bw/2},-44 ${bw/2+7},-18 ${-bw/2-7},-18" fill="${g(lc)}"/>`;
  const shoe=c.shoes||INK, sf=shoe===INK?INK:g(shoe);
  s+=`<ellipse cx="-12" cy="-3" rx="12" ry="6" fill="${sf}"/><ellipse cx="13" cy="-3" rx="12" ry="6" fill="${sf}"/>`;
  // left arm (+ tote)
  const lx=-bw/2-aw+6;
  s+=`<g transform="rotate(14 ${-bw/2+2} -70)"><rect x="${lx}" y="-72" width="${aw}" height="34" rx="${aw/2}" fill="${armFill}"/>${top==='tee'||top==='dress'?`<rect x="${lx-1}" y="-73" width="${aw+2}" height="14" rx="6" fill="${g(M)}"/>`:''}<circle cx="${lx+aw/2}" cy="-36" r="${aw/2+1}" fill="${g(skin)}"/></g>`;
  const lhx=lx+aw/2-9;
  if(c.left==='tote')s+=`<path d="M${lhx-8},-34 q8,-10 16,0" stroke="${INK}" stroke-width="3" fill="none"/><rect x="${lhx-14}" y="-34" width="28" height="30" rx="3" fill="${g('#f4e3b8')}"/><circle cx="${lhx}" cy="-19" r="6" fill="${M}"/>`;
  if(c.left==='handbag')s+=`<path d="M${lhx-7},-32 q7,-12 14,0" stroke="#f6c343" stroke-width="3" fill="none"/><rect x="${lhx-12}" y="-32" width="24" height="18" rx="5" fill="${g(shade(M,-.25))}"/><circle cx="${lhx}" cy="-26" r="2.5" fill="#f6c343"/>`;
  // torso
  const T=`x="${-bw/2}" y="-74" width="${bw}" height="46" rx="13"`;
  if(top==='tank')s+=`<rect ${T} fill="${g(skin)}"/><rect x="${-bw/2}" y="-60" width="${bw}" height="32" rx="10" fill="${g(M)}"/><rect x="${-bw/2+10}" y="-74" width="${bw-20}" height="24" rx="6" fill="${g(M)}"/>`;
  else if(top==='crop')s+=`<rect ${T} fill="${g(skin)}"/><rect x="${-bw/2}" y="-74" width="${bw}" height="27" rx="11" fill="${g(M)}"/>`;
  else if(top==='gilet')s+=`<rect ${T} fill="${g(shirt)}"/><rect x="${-bw/2}" y="-74" width="${bw/2-5}" height="46" rx="10" fill="${g(M)}"/><rect x="5" y="-74" width="${bw/2-5}" height="46" rx="10" fill="${g(M)}"/><path d="M0,-72 v40" stroke="${INK}" stroke-width="2.5"/>`;
  else if(top==='bodycon')s+=`<polygon points="${-bw/2},-74 ${bw/2},-74 ${bw/2-6},-52 ${bw/2+3},-20 ${-bw/2-3},-20 ${-bw/2+6},-52" fill="${g(M)}"/><rect x="${-bw/2}" y="-76" width="${bw}" height="12" rx="6" fill="${g(M)}"/>`;
  else s+=`<rect ${T} fill="${g(M)}"/>`;
  if(top==='openshirt')s+=`<polygon points="-9,-74 9,-74 0,-44" fill="${g(skin)}"/>`;
  if(top==='blazer')s+=`<polygon points="-12,-74 12,-74 0,-42" fill="${WHITE}"/><path d="M-12,-74 l12,32 l12,-32" stroke="${INK}" stroke-width="2.5" fill="none" opacity=".55"/>`;
  if(has('bowtie'))s+=`<polygon points="-11,-79 0,-73 -11,-66" fill="#e63946"/><polygon points="11,-79 0,-73 11,-66" fill="#e63946"/>`;
  if(top==='suit')s+=`<polygon points="-10,-73 10,-73 0,-48" fill="${WHITE}"/><polygon points="-3,-71 3,-71 4,-56 0,-49 -4,-56" fill="${INK}"/>`;
  if(top==='hoodie')s+=`<path d="M-12,-40 q12,-8 24,0" stroke="${INK}" stroke-width="3" fill="none" opacity=".6"/><path d="M-6,-72 v14 M6,-72 v14" stroke="${WHITE}" stroke-width="3" stroke-linecap="round"/>`;
  if(top==='wetsuit')s+=`<path d="M${-bw/2+9},-68 q-6,19 0,36" stroke="${WHITE}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  if(c.flag)s+=`<rect x="-13" y="-60" width="9" height="16" fill="#1f9d55"/><rect x="-4" y="-60" width="9" height="16" fill="${WHITE}"/><rect x="5" y="-60" width="9" height="16" fill="#e63946"/>`;
  if(has('chain'))s+=`<path d="M-13,-73 q13,20 26,0" stroke="#f6c343" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
  if(has('scarf'))s+=`<rect x="-24" y="-82" width="48" height="13" rx="6" fill="#1f9d55"/><rect x="-22" y="-76" width="13" height="36" rx="3" fill="#e63946"/><rect x="-22" y="-62" width="13" height="8" fill="#1f9d55"/>`;
  // right arm
  s+=`<g transform="rotate(-28 ${bw/2-2} -70)"><rect x="${bw/2-6}" y="-72" width="${aw}" height="32" rx="${aw/2}" fill="${armFill}"/>${top==='tee'||top==='dress'?`<rect x="${bw/2-7}" y="-73" width="${aw+2}" height="14" rx="6" fill="${g(M)}"/>`:''}</g>`;
  // prop
  const p=c.prop;
  if(p==='laptop')s+=`<rect x="${hx-18}" y="-58" width="36" height="24" rx="3" fill="${g('#cfd6de')}"/><circle cx="${hx}" cy="-46" r="4" fill="#e63946"/>`;
  if(p==='ringlight')s+=`<circle cx="${hx+4}" cy="-66" r="21" fill="none" stroke="${WHITE}" stroke-width="7"/><rect x="${hx-4}" y="-80" width="16" height="28" rx="3" fill="${INK}"/><rect x="${hx-2}" y="-77" width="12" height="20" rx="1" fill="${g('#8fd3ff')}"/>`;
  if(p==='phone')s+=`<rect x="${hx-5}" y="-76" width="17" height="30" rx="3" fill="${INK}"/><rect x="${hx-3}" y="-73" width="13" height="22" rx="1" fill="${g('#8fd3ff')}"/>`;
  if(p==='beer')s+=`<rect x="${hx-8}" y="-70" width="19" height="30" rx="3" fill="${g('#f0a81e')}"/><rect x="${hx-10}" y="-76" width="23" height="10" rx="5" fill="${WHITE}"/>`;
  if(p==='icedcoffee')s+=`<path d="M${hx+4},-90 v24" stroke="#e63946" stroke-width="3.5"/><rect x="${hx-8}" y="-68" width="18" height="28" rx="3" fill="${g('#c89b6d')}"/><rect x="${hx-10}" y="-72" width="22" height="7" rx="3" fill="${WHITE}"/>`;
  if(p==='spritz')s+=`<path d="M${hx-11},-78 h24 q0,20 -12,22 q-12,-2 -12,-22z" fill="${g('#ff7a3d')}"/><path d="M${hx+1},-56 v16 M${hx-7},-40 h16" stroke="${WHITE}" stroke-width="3.5" stroke-linecap="round"/>`;
  if(p==='shaker')s+=`<rect x="${hx-8}" y="-74" width="17" height="32" rx="5" fill="${g('#cfd6de')}"/><rect x="${hx-5}" y="-84" width="11" height="12" rx="3" fill="${g('#cfd6de')}"/>`;
  if(p==='vinyl')s+=`<circle cx="${hx+6}" cy="-54" r="20" fill="${INK}"/><circle cx="${hx+6}" cy="-54" r="13" fill="none" stroke="#3a3550" stroke-width="2"/><circle cx="${hx+6}" cy="-54" r="7" fill="#f6c343"/><circle cx="${hx+6}" cy="-54" r="2" fill="${INK}"/>`;
  if(p==='pasta')s+=`<ellipse cx="${hx+4}" cy="-56" rx="17" ry="9" fill="#f6c343"/><circle cx="${hx+4}" cy="-61" r="6" fill="#e63946"/><path d="M${hx-15},-54 h38 q-2,18 -19,18 q-17,0 -19,-18z" fill="${g('#e6ecf2')}"/>`;
  if(p==='fork')s+=`<rect x="${hx-1}" y="-122" width="6" height="88" rx="3" fill="${g('#cfd6de')}"/><rect x="${hx-9}" y="-146" width="5" height="28" rx="2" fill="${g('#cfd6de')}"/><rect x="${hx-1}" y="-146" width="6" height="28" rx="2" fill="${g('#cfd6de')}"/><rect x="${hx+8}" y="-146" width="5" height="28" rx="2" fill="${g('#cfd6de')}"/><rect x="${hx-9}" y="-124" width="22" height="7" rx="3" fill="${g('#cfd6de')}"/><ellipse cx="${hx+2}" cy="-146" rx="13" ry="7" fill="#f6c343"/>`;
  if(p==='espresso')s+=`<path d="M${hx-2},-70 q-4,-6 0,-11 M${hx+6},-70 q4,-6 0,-11" stroke="${WHITE}" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".8"/><rect x="${hx-7}" y="-64" width="17" height="13" rx="3" fill="${WHITE}"/><ellipse cx="${hx+2}" cy="-50" rx="14" ry="3.5" fill="${WHITE}"/>`;
  if(p==='sardine')s+=`<g transform="rotate(-35 ${hx} -50)"><polygon points="${hx-30},-50 ${hx-42},-60 ${hx-42},-40" fill="${g('#8fb4d9')}"/><ellipse cx="${hx-4}" cy="-50" rx="28" ry="9" fill="${g('#8fb4d9')}"/><circle cx="${hx+14}" cy="-52" r="2.5" fill="${INK}"/></g>`;
  if(p==='board')s+=`<ellipse cx="${hx+8}" cy="-76" rx="15" ry="76" fill="${g('#f4e3b8')}"/><path d="M${hx+8},-146 v140" stroke="${M}" stroke-width="6" fill="none"/>`;
  if(p==='racket')s+=`<rect x="${hx-2}" y="-64" width="6" height="24" rx="2" fill="${INK}"/><rect x="${hx-13}" y="-112" width="28" height="50" rx="13" fill="${g('#e63946')}"/>${[0,1,2].map(a=>[0,1].map(b=>`<circle cx="${hx-5+b*11}" cy="${-100+a*11}" r="2.2" fill="${WHITE}"/>`).join('')).join('')}`;
  if(p==='book')s+=`<rect x="${hx-13}" y="-70" width="28" height="34" rx="3" fill="${g('#8a2f3a')}"/><rect x="${hx-9}" y="-64" width="20" height="5" fill="#f6c343"/><rect x="${hx-13}" y="-40" width="28" height="4" fill="${WHITE}"/>`;
  if(p==='pointer')s+=`<g transform="rotate(24 ${hx} -43)"><rect x="${hx-2}" y="-138" width="4.5" height="98" rx="2" fill="${g('#c9833e')}"/><circle cx="${hx}" cy="-140" r="4.5" fill="#e63946"/></g>`;
  if(p==='paper')s+=`<rect x="${hx-13}" y="-80" width="27" height="36" rx="2" fill="${WHITE}"/><path d="M${hx-5},-52 v-18 h11 M${hx-5},-61 h8" stroke="#e63946" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  s+=`<circle cx="${hx}" cy="-43" r="${aw/2+1}" fill="${g(skin)}"/>`;
  // head
  s+=`<circle cx="-31" cy="-101" r="6" fill="${g(skin)}"/><circle cx="31" cy="-101" r="6" fill="${g(skin)}"/><circle cx="0" cy="-104" r="32" fill="${g(skin)}"/>`;
  const CAP=`<path d="M-33,-106 a33,33 0 0 1 66,0 q-10,-17 -31,-14 q-22,-6 -35,14z" fill="${g(hc)}"/>`;
  if(['short','mullet','bun','ponytail','bob','quiff','highpony'].includes(hs))s+=CAP;
  if(hs==='wavy')s+=`<path d="M-34,-98 a34,34 0 0 1 68,0 q-4,-22 -22,-30 q-10,14 -46,30z" fill="${g(hc)}"/>`;
  if(hs==='long')s+=`<path d="M-33,-100 a33,33 0 0 1 66,0 q-8,-26 -33,-28 q-25,2 -33,28z" fill="${g(hc)}"/>`;
  if(hs==='slick')s+=`<path d="M-33,-110 a33,33 0 0 1 66,0 q-12,-18 -33,-18 q-21,0 -33,18z" fill="${g(hc)}"/>`;
  if(hs==='buzz')s+=`<path d="M-32,-114 a32,30 0 0 1 64,0 q-32,-16 -64,0z" fill="${g(hc)}"/>`;
  if(hs==='quiff')s+=`<ellipse cx="6" cy="-135" rx="23" ry="12" fill="${g(hc)}"/>`;
  if(hs==='bun')s+=`<circle cx="0" cy="-145" r="13" fill="${g(hc)}"/>`;
  if(hs==='curly')for(let a=180;a<=360;a+=30)s+=`<circle cx="${(Math.cos(a*Math.PI/180)*29).toFixed(1)}" cy="${(-108+Math.sin(a*Math.PI/180)*29).toFixed(1)}" r="13" fill="${g(hc)}"/>`;
  // face
  if(has('sunglasses'))s+=`<rect x="-26" y="-112" width="23" height="14" rx="5" fill="${INK}"/><rect x="3" y="-112" width="23" height="14" rx="5" fill="${INK}"/><path d="M-4,-106 h8" ${face}/>`;
  else if(has('lashes'))s+=`<ellipse cx="-11" cy="-101" rx="4.5" ry="6" fill="${INK}"/><ellipse cx="13" cy="-101" rx="4.5" ry="6" fill="${INK}"/><circle cx="-9.5" cy="-103.5" r="1.8" fill="${WHITE}"/><circle cx="14.5" cy="-103.5" r="1.8" fill="${WHITE}"/><path d="M-16,-106 l-6,-4 M18,-106 l6,-4" ${face}/>`;
  else{s+=`<circle cx="-11" cy="-101" r="4" fill="${INK}"/><circle cx="13" cy="-101" r="4" fill="${INK}"/>`;
    if(has('glasses'))s+=`<rect x="-23" y="-110" width="21" height="17" rx="5" fill="none" stroke="${INK}" stroke-width="3.5"/><rect x="2" y="-110" width="21" height="17" rx="5" fill="none" stroke="${INK}" stroke-width="3.5"/>`;}
  if(has('blush'))s+=`<ellipse cx="-20" cy="-91" rx="6" ry="3.5" fill="#d6336c" opacity=".45"/><ellipse cx="22" cy="-91" rx="6" ry="3.5" fill="#d6336c" opacity=".45"/>`;
  if(has('earrings'))s+=`<circle cx="-32" cy="-91" r="4.5" fill="#f6c343"/><circle cx="32" cy="-91" r="4.5" fill="#f6c343"/>`;
  if(has('shadesup'))s+=`<rect x="-24" y="-136" width="21" height="11" rx="5" fill="${INK}"/><rect x="3" y="-136" width="21" height="11" rx="5" fill="${INK}"/><path d="M-4,-131 h8" ${face}/>`;
  if(has('beard'))s+=`<path d="M-30,-98 q30,50 60,0 q-2,34 -30,36 q-28,-2 -30,-36z" fill="${g(hc)}"/>`;
  if(has('moustache'))s+=`<path d="M-17,-86 q8,-10 17,-2 q9,-8 17,2 q-9,8 -17,2 q-8,6 -17,-2z" fill="${g(hc)}"/>`;
  else if(has('lips'))s+=`<path d="M-7,-86 q8,7 16,0" stroke="#d6336c" stroke-width="5" stroke-linecap="round" fill="none"/>`;
  else s+=`<path d="M-8,-86 q9,8 18,0" ${face}/>`;
  if(has('headphones'))s+=`<path d="M-37,-104 a37,38 0 0 1 74,0" stroke="#3a3550" stroke-width="8" fill="none"/><rect x="-45" y="-116" width="14" height="28" rx="6" fill="${g(M)}"/><rect x="31" y="-116" width="14" height="28" rx="6" fill="${g(M)}"/>`;
  if(has('cap'))s+=`<path d="M-34,-110 a34,34 0 0 1 68,0z" fill="${g(M)}"/><rect x="-58" y="-116" width="28" height="9" rx="4" fill="${g(M)}"/>`;
  if(has('capfwd'))s+=`<path d="M-34,-110 a34,34 0 0 1 68,0z" fill="${g(M)}"/><rect x="26" y="-116" width="30" height="9" rx="4" fill="${g(M)}"/>`;
  if(has('flatcap'))s+=`<path d="M-37,-114 q6,-30 40,-28 q32,2 36,22 q10,2 12,10 q-46,-12 -88,-4z" fill="${g(M)}"/>`;
  const defs='<defs>'+[...used].map(([h,id])=>`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset=".15" stop-color="${shade(h,.38)}"/><stop offset=".5" stop-color="${h}"/><stop offset=".9" stop-color="${shade(h,-.42)}"/></linearGradient>`).join('')+'</defs>';
  const pal=[...used.keys()].flatMap(h=>[shade(h,.28),h,shade(h,-.3)]).concat(FLAT,[M]).map(hex);
  return {svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-80 -168 160 180" width="640" height="720">${defs}${s}</svg>`,pal};
}

function sprite(cv,cfg,M){
  const {svg,pal}=build(cfg,M), h=81, w=72; cv.width=w+2; cv.height=h+2;
  const img=new Image();
  img.onload=()=>{
    const x=cv.getContext('2d'); x.drawImage(img,1,1,w,h);
    try{
      const d=x.getImageData(0,0,cv.width,cv.height), p=d.data, W=cv.width, H=cv.height;
      for(let i=0;i<p.length;i+=4){
        if(p[i+3]<120){p[i+3]=0;continue}
        let b=0,bd=1e9;
        for(let k=0;k<pal.length;k++){const q=pal[k],e=(p[i]-q[0])**2+(p[i+1]-q[1])**2+(p[i+2]-q[2])**2;if(e<bd){bd=e;b=k}}
        p[i]=pal[b][0];p[i+1]=pal[b][1];p[i+2]=pal[b][2];p[i+3]=255;
      }
      const solid=new Uint8Array(W*H); for(let i=0;i<W*H;i++)solid[i]=p[i*4+3]?1:0;
      const k=hex(INK);
      for(let y=0;y<H;y++)for(let xx=0;xx<W;xx++){const i=y*W+xx; if(solid[i])continue;
        if((xx>0&&solid[i-1])||(xx<W-1&&solid[i+1])||(y>0&&solid[i-W])||(y<H-1&&solid[i+W])){p[i*4]=k[0];p[i*4+1]=k[1];p[i*4+2]=k[2];p[i*4+3]=255}}
      x.putImageData(d,0,0);
    }catch(e){}
  };
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}


const DARK='#2b2740', JEANS='#3b6ea8', CHINO='#d9c39a', CREAM='#e8e4da';
const PLAYER_COLORS=['#e63946','#2f7fe0','#22a36b','#f6c343']; // P1..P4, used for name tags
const FIGHTERS=[
 {id:'finance_bro',name:'Finance Bro',color:'#2f7fe0',weight:100,speed:3,normal:'Laptop Swing',special:'Cash Rain',
  specialText:'Banknotes rain in a radius around him. Opponents inside slip and slide away.',phone:'You slipped on cash!',specialItem:'banknotes',
  cfg:{hair:['slick','#3a2416'],top:'gilet',legs:['trousers',CHINO],prop:'laptop'}},
 {id:'maastricht_blondie',name:'Maastricht Blondie',color:'#e85d9c',weight:85,speed:4,normal:'Tote Bag Swing',special:'Padel Smash',
  specialText:'Hits a padel ball forward. Heavy damage on the first opponent it hits.',phone:'Smashed!',specialItem:'padel racket',
  cfg:{build:'slim',skin:'#fbd9c0',hair:['bob','#ffe08a'],top:'dress',legs:['skirt','M'],prop:'racket',left:'tote'}},
 {id:'bairro_chad',name:'Bairro Chad',color:'#e63946',weight:120,speed:2,normal:'Beer Throw',special:'Round\'s On Me',
  specialText:'Slams his cup down. Everyone in a radius is tipsy for 4 s.',phone:'You\'re drunk! Drink water!',specialItem:'beer cup',
  cfg:{build:'buff',skin:'#e0a070',hair:['mullet','#7a4a2c'],top:'tank',legs:['shorts',JEANS],extras:['cap','chain'],prop:'beer'}},
 {id:'surfer_girl',name:'Surfer Girl',color:'#1aa6a6',weight:85,speed:5,normal:'Board Swipe',special:'Wave Rider',
  specialText:'Surfs forward on a small wave and pushes opponents along.',phone:'Wipeout!',specialItem:'surfboard',
  cfg:{build:'slim',skin:'#e0a070',hair:['ponytail','#f6c343'],top:'wetsuit',legs:['trousers','M'],shoes:'#e0a070',prop:'board'}},
 {id:'wannabe_influencer',name:'Wannabe Influencer',color:'#e0457b',weight:90,speed:4,normal:'Selfie Stick Poke',special:'Ring Light Flash',
  specialText:'Pulls out a ring light. Only the nearest opponent is hit: stunned for 1 s, their phone flashes white.',phone:'Blinded! No filter can save you.',specialItem:'ring light',
  cfg:{build:'slim',skin:'#e8b088',hair:['wavy','#5a3320'],top:'bodycon',legs:['bare',DARK],shoes:'#e0457b',extras:['lashes','lips','blush','earrings'],prop:'phone',left:'handbag'}},
 {id:'house_dj',name:'House DJ',color:'#ff7a3d',weight:100,speed:3,normal:'Vinyl Throw',special:'Bass Drop',
  specialText:'Jumps and slams down. The shockwave launches everyone in a radius upward.',phone:'BASS DROP!',specialItem:'speaker',
  cfg:{skin:'#a86b45',hair:['short','#1d1a26'],top:'tee',legs:['trousers',DARK],extras:['headphones'],prop:'vinyl'}},
 {id:'lisboa_og',name:'Lisboa OG',color:'#22a36b',weight:115,speed:2,normal:'Sardine Slap',special:'Ding-Ding',
  specialText:'Sends a mini Tram 28 rolling along the ground in the direction he faces.',phone:'Run over by the 28!',specialItem:'mini tram',
  cfg:{skin:'#d9a877',hair:['short','#c9c9d1'],top:'gilet',legs:['trousers','#5a4a3a'],extras:['flatcap','moustache'],prop:'espresso'}},
 {id:'carcavelos_gang_member',name:'Carcavelos Gang Member',color:'#e0a81e',weight:100,speed:3,normal:'Pizza Throw',special:'Spaghetti Lasso',
  specialText:'Throws a spaghetti lasso forward and pulls the first opponent it hits towards him.',phone:'Caught in the pasta!',specialItem:'spaghetti',
  cfg:{skin:'#d9a877',hair:['curly','#3a2416'],top:'tee',flag:1,legs:['trousers',CREAM],extras:['moustache'],prop:'pasta'}},
];
