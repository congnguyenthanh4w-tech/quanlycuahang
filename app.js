'use strict';
/* QuanLyCuaHang — v2: chạy trên trình duyệt (localStorage) + đồng bộ server
   qua Firebase khi đăng nhập tài khoản (xem khối ĐỒNG BỘ SERVER ở cuối file).
   Mô hình dữ liệu:
   villages[]  {id,name}
   customers[] {id,name,villageId,phone,note}
   suppliers[] {id,name,phone,address,note}
   products[]  {id,name,code,barcode,group,unit,sellPrice,threshold,warnDays,status,image,
                lots:[{id,date,qty,importPrice,expiry}], priceHistory:[{date,kind,price}]}
   debts[]     {id,customerId,datetime,note,total,evidence,evidenceName,
                payments:[{id,date,amount,method}]}
   invoices[]  {id,supplierId,date,total,image,note,
                payments:[{id,date,amount,method}]}
   cash[]      {id,datetime,kind:'thu'|'chi',type,amount,content,person,evidence,note,
                source:'manual'|'debtPayment'|'supplierPayment', sourceRef}
   Liên kết chống trùng: mỗi lần trả nợ KH / trả NCC chỉ sinh đúng 1 giao dịch
   thu/chi có sourceRef = id của lần trả đó; xoá lần trả thì xoá giao dịch kèm theo. */
const LS_KEY='qlch_v1', THEME_KEY='qlch_theme';
const GROUPS=['Bánh kẹo','Nước ngọt','Gia vị','Đồ khô','Sữa & đồ uống','Đồ gia dụng','Khác'];
const DEFAULT_UNITS=['Gói','Chai','Lon','Hộp','Thùng','Cái','Kg','Lít','Bao','Vỉ','Túi','Bịch'];
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const todayISO=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const nowLocal=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};
const fmtMoney=n=>Math.round(Number(n)||0).toLocaleString('vi-VN')+'đ';
const fmtDate=s=>{if(!s)return'—';const[y,m,d]=String(s).slice(0,10).split('-');return d+'/'+m+'/'+y;};
const fmtDT=s=>{if(!s)return'—';const p=String(s);return fmtDate(p)+(p.includes('T')?' '+p.slice(11,16):'');};
const daysUntil=s=>{if(!s)return null;const a=new Date(todayISO()+'T00:00:00'),b=new Date(String(s).slice(0,10)+'T00:00:00');return Math.round((b-a)/86400000);};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{let t=String(v??'').trim().replace(/\s/g,'');if(!t)return 0;
  if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t))t=t.replace(/\./g,'').replace(',','.');
  else if(/^\d+,\d+$/.test(t))t=t.replace(',','.');
  const n=parseFloat(t.replace(/[^\d.-]/g,''));return isNaN(n)?0:n;};
const normVN=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'d');

let DB=load();
const groups=()=>Array.isArray(DB.groups)&&DB.groups.length?DB.groups:GROUPS;
const units=()=>Array.isArray(DB.units)&&DB.units.length?DB.units:DEFAULT_UNITS;
function ensureTax(){if(!Array.isArray(DB.groups)||!DB.groups.length)DB.groups=groups().slice();if(!Array.isArray(DB.units)||!DB.units.length)DB.units=units().slice();}
function defaults(){return{
  villages:['Thôn 1','Thôn 2','Thôn 3','Thôn 4','Thôn 5A'].map(name=>({id:uid()+name,name})),
  groups:GROUPS.slice(),units:DEFAULT_UNITS.slice(),
  customers:[],suppliers:[],products:[],debts:[],invoices:[],cash:[]};}
function normalizeDB(d){
  if(!Array.isArray(d.groups)||!d.groups.length)d.groups=[...new Set([...GROUPS,...d.products.map(x=>x.group).filter(Boolean)])];
  if(!Array.isArray(d.units)||!d.units.length)d.units=[...new Set([...DEFAULT_UNITS,...d.products.map(x=>x.unit).filter(Boolean)])];
  return d;}
function load(){try{const raw=localStorage.getItem(LS_KEY);if(raw){const d=JSON.parse(raw);if(d&&Array.isArray(d.products))return normalizeDB(d);}}catch(e){}return defaults();}
function save(){try{localStorage.setItem(LS_KEY,JSON.stringify(DB));}catch(e){toast('⚠️ Bộ nhớ đầy — hãy xoá bớt ảnh hoặc Sao lưu rồi dọn dữ liệu.');}syncTouch();}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.add('hidden'),2600);}
let _undoSnap=null;
function armUndo(){_undoSnap=JSON.stringify(DB);}
function toastUndo(msg){const t=document.getElementById('toast');t.innerHTML='';t.appendChild(document.createTextNode(msg));
  const b=document.createElement('button');b.textContent='Hoàn tác';b.className='toast-undo';
  b.onclick=()=>{if(_undoSnap){DB=JSON.parse(_undoSnap);_undoSnap=null;save();closeModal();renderAll();toast('Đã hoàn tác.');}};
  t.appendChild(b);t.classList.remove('hidden');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.add('hidden'),7000);}

/* ---------- tính toán ---------- */
const stockOf=p=>(p.lots||[]).reduce((s,l)=>s+(Number(l.qty)||0),0);
const debtPaid=d=>(d.payments||[]).reduce((s,p)=>s+(Number(p.amount)||0),0);
const debtRemain=d=>(Number(d.total)||0)-debtPaid(d);
const invPaid=i=>(i.payments||[]).reduce((s,p)=>s+(Number(p.amount)||0),0);
const invRemain=i=>(Number(i.total)||0)-invPaid(i);
function payHistoryHtml(owner){let run=0;return (owner.payments||[]).map(p=>{run+=Number(p.amount)||0;const rem=(Number(owner.total)||0)-run;
  return '<div class="kv"><span>\u21A9 '+fmtDate(p.date)+' \u00B7 '+esc(p.method||'')+(p.person?' \u00B7 '+esc(p.person):'')+'</span><span style="text-align:right"><b>'+fmtMoney(p.amount)+'</b><br><span style="color:var(--muted);font-size:12.5px">Còn lại '+fmtMoney(rem)+'</span></span></div>';}).join('');}
const customer=id=>DB.customers.find(c=>c.id===id);
const supplier=id=>DB.suppliers.find(s=>s.id===id);
const village=id=>DB.villages.find(v=>v.id===id);
const customerDebtTotal=cid=>DB.debts.filter(d=>d.customerId===cid).reduce((s,d)=>s+debtRemain(d),0);
function productAlerts(p){
  const out=[],stock=stockOf(p);
  if(p.status==='active'){
    if(stock===0)out.push({kind:'out',label:'Hết hàng'});
    else if(stock<=(Number(p.threshold)||0))out.push({kind:'low',label:'Sắp hết tồn ('+stock+')'});
  }
  for(const l of (p.lots||[])){
    if((Number(l.qty)||0)<=0||!l.expiry)continue;
    const du=daysUntil(l.expiry);
    if(du<0)out.push({kind:'expired',label:'Có lô đã hết hạn '+fmtDate(l.expiry)});
    else if(du<=(Number(p.warnDays)||30))out.push({kind:'expiring',label:'Sắp hết hạn '+fmtDate(l.expiry)+' ('+du+' ngày)'});
  }
  return out;
}
function allAlerts(){
  const a={out:[],low:[],expiring:[],expired:[]};
  for(const p of DB.products){for(const al of productAlerts(p)){
    if(al.kind==='out')a.out.push({p,al});else if(al.kind==='low')a.low.push({p,al});
    else if(al.kind==='expired')a.expired.push({p,al});else a.expiring.push({p,al});}}
  return a;
}

/* ---------- theme & tabs ---------- */
function applyTheme(t){document.documentElement.dataset.theme=t;localStorage.setItem(THEME_KEY,t);
  document.getElementById('btnTheme').textContent=t==='dark'?'☀️ Sáng':'🌙 Tối';
  const sb=document.getElementById('btnThemeSide');if(sb)sb.textContent=t==='dark'?'☀️ Chế độ sáng':'🌙 Chế độ tối';}
(function initTheme(){const saved=localStorage.getItem(THEME_KEY);
  applyTheme(saved||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));})();
document.getElementById('btnTheme').onclick=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
document.getElementById('todayLine').textContent='Hôm nay '+fmtDate(todayISO());
document.getElementById('tabs').addEventListener('click',e=>{
  const b=e.target.closest('[data-tab]');if(!b)return;switchTab(b.dataset.tab);});
function switchTab(name){
  document.querySelectorAll('#tabs .tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  document.querySelectorAll('#sideNav .side-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));
  renderAll();
}

/* ---------- modal ---------- */
const modalWrap=document.getElementById('modalWrap'),modalBox=document.getElementById('modalBox');
function openModal(html){modalBox.innerHTML='<button class="close-x" id="modalClose">✕</button>'+html;modalWrap.classList.remove('hidden');
  document.getElementById('modalClose').onclick=closeModal;
  modalBox.querySelectorAll('input.mn').forEach(inp=>{
    if(inp.value){const v=num(inp.value);if(v)inp.value=v.toLocaleString('vi-VN');}
    inp.addEventListener('input',()=>{const raw=inp.value.replace(/[^\d]/g,'');inp.value=raw?Number(raw).toLocaleString('vi-VN'):'';});});
  modalBox.querySelectorAll('input[type="file"]').forEach(inp=>{
    inp.classList.add('filepick-native');
    const isVideo=(inp.accept||'').indexOf('video')>=0;
    const wrap=document.createElement('div');wrap.className='filepick';
    wrap.innerHTML='<button type="button" class="btn filepick-btn">'+(isVideo?'📷 Chọn ảnh / video':'📷 Chọn ảnh / chụp')+'</button><span class="filepick-name">Chưa chọn tệp</span>';
    inp.insertAdjacentElement('afterend',wrap);
    const nameEl=wrap.querySelector('.filepick-name');
    const fld=inp.closest('.field');
    if(fld&&fld.querySelector('img.preview:not(.hidden)'))nameEl.textContent='Đã có ảnh sẵn — chọn tệp để thay';
    wrap.querySelector('.filepick-btn').onclick=()=>inp.click();
    inp.addEventListener('change',()=>{const f=inp.files&&inp.files[0];nameEl.textContent=f?f.name:'Chưa chọn tệp';});});
  if(!('ontouchstart' in window))setTimeout(()=>{const f=modalBox.querySelector('input:not([type="file"]):not([type="date"]):not([type="datetime-local"]),select,textarea');if(f)f.focus();},70);}
function closeModal(){_scanCb=null;modalWrap.classList.add('hidden');modalBox.innerHTML='';}
modalWrap.addEventListener('click',e=>{if(e.target===modalWrap)closeModal();});
function field(label,inner){return '<div class="field"><label>'+label+'</label>'+inner+'</div>';}
function fileToDataURL(input,cb){
  const f=input.files&&input.files[0];if(!f){cb(null,null);return;}
  if(f.type.startsWith('image/')){
    const img=new Image();
    img.onload=()=>{const max=1000,sc=Math.min(1,max/Math.max(img.width,img.height));
      const cv=document.createElement('canvas');cv.width=Math.round(img.width*sc);cv.height=Math.round(img.height*sc);
      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);URL.revokeObjectURL(img.src);
      cb(cv.toDataURL('image/jpeg',0.72),f.name);};
    img.src=URL.createObjectURL(f);
  }else{ /* video / file khác: chỉ nhận nếu nhỏ, tránh đầy bộ nhớ */
    if(f.size>4*1024*1024){toast('Video quá lớn (>4MB) — hãy quay ngắn lại hoặc chỉ lưu ảnh chụp.');cb(null,null);return;}
    const r=new FileReader();r.onload=()=>cb(r.result,f.name);r.readAsDataURL(f);
  }
}


/* ---------- thẻ thống kê ---------- */
const ic=(id,cls)=>'<svg class="ic '+(cls||'')+'" aria-hidden="true"><use href="#'+id+'"/></svg>';
function statCard(icon,tint,label,value,cls){
  return '<div class="card stat"><div class="stat-ico '+tint+'">'+ic(icon)+'</div><div class="stat-body"><small>'+label+'</small><b class="'+(cls||'')+'">'+value+'</b></div></div>';
}
/* ---------- TỔNG QUAN ---------- */
function renderDashboard(){
  const totalDebt=DB.debts.reduce((s,d)=>s+debtRemain(d),0);
  const totalSup=DB.invoices.reduce((s,i)=>s+invRemain(i),0);
  const t=todayISO(),month=t.slice(0,7);
  const sumCash=(kind,prefix)=>DB.cash.filter(c=>c.kind===kind&&String(c.datetime).startsWith(prefix)).reduce((s,c)=>s+(Number(c.amount)||0),0);
  document.getElementById('dashCards').innerHTML=
    statCard('i-receipt','red','Khách còn nợ',fmtMoney(totalDebt),totalDebt>0?'red':'')+statCard('i-truck','amber','Còn nợ nhà cung cấp',fmtMoney(totalSup),totalSup>0?'amber':'')+
    statCard('i-in','green','Thu hôm nay',fmtMoney(sumCash('thu',t)),'green')+statCard('i-out','','Chi hôm nay',fmtMoney(sumCash('chi',t)),'')+
    statCard('i-coins','green','Thu tháng này',fmtMoney(sumCash('thu',month)),'green')+statCard('i-wallet','blue','Chi tháng này',fmtMoney(sumCash('chi',month)),'');
  const heroDebtEl=document.getElementById('heroDebt'); if(heroDebtEl)heroDebtEl.textContent=fmtMoney(totalDebt);
  const heroSubEl=document.getElementById('heroSub');
  if(heroSubEl){const aa=allAlerts();const nA=aa.expired.length+aa.out.length+aa.expiring.length+aa.low.length;
    const nd=new Set(DB.debts.filter(d=>debtRemain(d)>0).map(d=>d.customerId)).size;
    heroSubEl.textContent=nd+' khách đang nợ · còn nợ nhà cung cấp '+fmtMoney(totalSup)+' · '+nA+' cảnh báo cần chú ý';}
  const chartEl=document.getElementById('chartBox');
  if(chartEl){const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));}
    const thuD=days.map(d=>DB.cash.filter(c=>c.kind==='thu'&&String(c.datetime).startsWith(d)).reduce((x,c)=>x+(Number(c.amount)||0),0));
    const chiD=days.map(d=>DB.cash.filter(c=>c.kind==='chi'&&String(c.datetime).startsWith(d)).reduce((x,c)=>x+(Number(c.amount)||0),0));
    const mx=Math.max(0,...thuD,...chiD);
    if(mx===0){chartEl.innerHTML='<div class="chart-empty">Chưa có thu chi trong 7 ngày qua.<br>Các cột sẽ xuất hiện khi có giao dịch.</div>';}
    else chartEl.innerHTML=days.map((d,i)=>'<div class="col"><div class="bars">'+
      '<div class="bar-v thu" style="height:'+Math.max(3,Math.round(thuD[i]/mx*118))+'px" title="Thu '+fmtDate(d)+': '+fmtMoney(thuD[i])+'"></div>'+
      '<div class="bar-v chi" style="height:'+Math.max(3,Math.round(chiD[i]/mx*118))+'px" title="Chi '+fmtDate(d)+': '+fmtMoney(chiD[i])+'"></div></div>'+
      '<div class="dlabel">'+fmtDate(d).slice(0,5)+'</div></div>').join('');}
  const a=allAlerts();
  const totalAlerts=a.expired.length+a.out.length+a.expiring.length+a.low.length;
  const badge=document.getElementById('sideAlertBadge');
  if(badge){badge.textContent=totalAlerts;badge.classList.toggle('hidden',totalAlerts===0);}
  const tbadge=document.getElementById('tabAlertBadge');
  if(tbadge){tbadge.textContent=totalAlerts;tbadge.classList.toggle('hidden',totalAlerts===0);}
  const bh=document.getElementById('backupHint');
  if(bh){const lastB=Number(localStorage.getItem('qlch_backup_at')||0);const hasData=DB.products.length||DB.debts.length||DB.customers.length;
    /* v2.5.2: chỉ nhắc khi dữ liệu THẬT SỰ chưa an toàn — banner cũ (v1) chỉ
       nhìn lần tải file sao lưu nên báo động giả dù đã đồng bộ server.
       Đã đồng bộ ≤7 ngày HOẶC mới sao lưu file ≤7 ngày → im lặng.
       Đọc lastSyncAt từ bản đã lưu trong máy (không đụng biến _sync ở phần
       Sync khai báo phía dưới — render có thể chạy trước khi tới lượt nó). */
    let lastS=0; try{lastS=Number((JSON.parse(localStorage.getItem('qlch_sync')||'{}')).lastSyncAt||0);}catch(e){}
    const syncedOk=lastS&&(Date.now()-lastS<=7*86400000);
    const backupOk=lastB&&(Date.now()-lastB<=7*86400000);
    bh.innerHTML=(hasData&&!syncedOk&&!backupOk)?
      '<div class="backup-hint"><span>⚠ '+((!lastB&&!lastS)?'Dữ liệu trên máy này chưa được đồng bộ lên server, cũng chưa từng sao lưu.':'Đã hơn 7 ngày dữ liệu chưa được đồng bộ lên server hay sao lưu.')+' Kiểm tra đăng nhập/mạng, hoặc bấm Sao lưu để tải 1 bản dự phòng.</span><button class="btn btn-small" id="bhBtn">Sao lưu ngay</button></div>':'';
    const bb=document.getElementById('bhBtn');if(bb)bb.onclick=()=>document.getElementById('btnExport').click();}
  const sub=document.getElementById('dashSub'); if(sub)sub.textContent='Tình hình cửa hàng · '+fmtDate(t);
  const grp=(title,icon,tint,items,hot)=>items.length?
    '<div class="alert-panel"><div class="alert-head"><span class="dot-ico '+tint+'" style="width:32px;height:32px">'+ic(icon,'ic-sm')+'</span>'+title+'<span class="count'+(hot?' hot':'')+'">'+items.length+'</span></div>'+
    items.map(({p,al})=>'<button class="alert-item" data-prod="'+p.id+'"><span class="grow"><span class="t">'+esc(p.name)+'</span><br><span class="s">'+esc(al.label)+'</span></span><span class="chev">'+ic('i-chev','ic-sm')+'</span></button>').join('')+'</div>':'';
  const html=grp('Đã hết hạn','i-alert','chi',a.expired,true)+grp('Hết hàng','i-box','chi',a.out,true)+
             grp('Sắp hết hạn','i-clock','warn',a.expiring,false)+grp('Sắp hết tồn kho','i-box','warn',a.low,false);
  document.getElementById('alertsBox').innerHTML=html||'<div class="empty-box">Không có cảnh báo nào — hàng hoá đang ổn.</div>';
  const recent=DB.cash.slice().sort((x,y)=>String(y.datetime).localeCompare(String(x.datetime))).slice(0,5);
  document.getElementById('recentBox').innerHTML=recent.length?recent.map(c=>
    '<div class="mini-row"><span class="dot-ico '+(c.kind==='thu'?'':'chi')+'">'+ic(c.kind==='thu'?'i-in':'i-out','ic-sm')+'</span>'+
    '<span class="grow"><span class="t">'+esc(c.type)+'</span><br><span class="s">'+fmtDT(c.datetime)+(c.content?' · '+esc(c.content):'')+'</span></span>'+
    '<span class="money '+(c.kind==='thu'?'green':'red')+'">'+(c.kind==='thu'?'+':'-')+fmtMoney(c.amount)+'</span></div>').join('')
    :'<div class="empty">Chưa có giao dịch thu chi nào.</div>';
  const tops=DB.customers.map(c=>({c,t:customerDebtTotal(c.id)})).filter(r=>r.t>0).sort((x,y)=>y.t-x.t).slice(0,5);
  document.getElementById('topDebtBox').innerHTML=tops.length?tops.map(r=>
    '<div class="mini-row" data-cust2="'+r.c.id+'" style="cursor:pointer"><span class="avatar">'+esc(r.c.name.trim().charAt(0).toUpperCase()||'?')+'</span>'+
    '<span class="grow"><span class="t">'+esc(r.c.name)+'</span><br><span class="s">'+esc((village(r.c.villageId)||{}).name||'')+'</span></span>'+
    '<span class="money red">'+fmtMoney(r.t)+'</span></div>').join('')
    :'<div class="empty">Không có khách nào đang nợ.</div>';
}
document.getElementById('alertsBox').addEventListener('click',e=>{const b=e.target.closest('[data-prod]');if(b){switchTab('products');openProduct(b.dataset.prod);}});
document.getElementById('topDebtBox').addEventListener('click',e=>{const r=e.target.closest('[data-cust2]');if(r){switchTab('debts');openCustomer(r.dataset.cust2);}});

/* ---------- SẢN PHẨM ---------- */
let prodGroupFilter='',prodSort='name';
function renderProducts(){
  const q=normVN(document.getElementById('prodSearch').value||'');
  document.getElementById('prodGroupChips').innerHTML=
    '<button class="chip'+(prodGroupFilter==='__alerts'?' active':'')+'" data-group="__alerts">⚠ Có cảnh báo</button>'+
    [''].concat(groups()).map(g=>'<button class="chip'+(prodGroupFilter===g?' active':'')+'" data-group="'+esc(g)+'">'+(g||'Tất cả')+'</button>').join('');
  const list=DB.products.filter(p=>
    (prodGroupFilter==='__alerts'?productAlerts(p).length>0:(!prodGroupFilter||p.group===prodGroupFilter))&&
    (!q||normVN(p.name).includes(q)||normVN(p.code||'').includes(q)||normVN(p.group||'').includes(q)||(p.barcode||'').includes(q)));
  const minExp=p=>{const es=(p.lots||[]).filter(l=>l.expiry).map(l=>l.expiry);return es.length?es.sort()[0]:'9999-99';};
  if(prodSort==='stockAsc')list.sort((a,b)=>stockOf(a)-stockOf(b));
  else if(prodSort==='expiry')list.sort((a,b)=>minExp(a).localeCompare(minExp(b)));
  else if(prodSort==='alerts')list.sort((a,b)=>productAlerts(b).length-productAlerts(a).length||a.name.localeCompare(b.name,'vi'));
  else list.sort((a,b)=>a.name.localeCompare(b.name,'vi'));
  document.getElementById('productList').innerHTML=list.length?list.map(p=>{
    const st=stockOf(p),alerts=productAlerts(p);
    return '<div class="row" data-prod="'+p.id+'">'+
      (p.image?'<img class="thumb" src="'+p.image+'" alt="">':'<span class="dot-ico" style="width:52px;height:52px;border-radius:11px;background:var(--surface2);color:var(--muted)">'+ic('i-box')+'</span>')+
      '<div class="grow"><div class="title">'+esc(p.name)+(p.status==='stopped'?' <span class="badge">Ngừng kinh doanh</span>':'')+'</div>'+
      '<div class="sub">'+esc(p.code||'')+(p.barcode?' · '+esc(p.barcode):'')+' · '+esc(p.group||'')+' · Bán '+fmtMoney(p.sellPrice)+'</div>'+
      alerts.map(a=>'<span class="badge '+((a.kind==='expired'||a.kind==='out')?'red':'amber')+'">'+esc(a.label)+'</span> ').join('')+
      '</div><div style="text-align:right"><div class="sub">Tồn kho</div><b>'+st+' '+esc(p.unit||'')+'</b></div></div>';
  }).join(''):'<div class="empty">Chưa có sản phẩm nào khớp. Bấm “＋ Thêm sản phẩm”.</div>';
}
document.getElementById('prodSearch').addEventListener('input',renderProducts);
document.getElementById('prodSort').addEventListener('change',e=>{prodSort=e.target.value;renderProducts();});
document.getElementById('btnDebtOnly').addEventListener('click',e=>{custDebtOnly=!custDebtOnly;e.currentTarget.classList.toggle('on',custDebtOnly);renderDebts();});
document.getElementById('prodGroupChips').addEventListener('click',e=>{
  const b=e.target.closest('[data-group]');if(b){prodGroupFilter=b.dataset.group;renderProducts();}});
document.getElementById('productList').addEventListener('click',e=>{
  const r=e.target.closest('[data-prod]');if(r)openProduct(r.dataset.prod);});

function productForm(p,prefillBarcode){
  p=p||{name:'',code:'',barcode:prefillBarcode||'',group:groups()[0],unit:'Gói',sellPrice:'',threshold:5,warnDays:30,status:'active',image:'',lots:[],priceHistory:[]};
  openModal('<h2>'+(p.id?'Sửa sản phẩm':'Thêm sản phẩm')+'</h2><form id="fProd">'+
    field('Ảnh sản phẩm (chụp hoặc tải lên)','<input type="file" id="pImage" accept="image/*">'+(p.image?'<img class="preview" id="pPreview" src="'+p.image+'">':'<img class="preview hidden" id="pPreview">'))+
    field('Tên sản phẩm *','<input id="pName" required value="'+esc(p.name)+'">')+
    '<div class="grid2">'+field('Mã sản phẩm (để trống = tự sinh)','<input id="pCode" value="'+esc(p.code||'')+'" placeholder="VD: HH001">')+
    field('Barcode','<div class="scan-row"><input id="pBarcode" value="'+esc(p.barcode||'')+'" inputmode="numeric" placeholder="Quét hoặc gõ mã"><button type="button" class="btn" id="pScanBtn">Quét</button></div>')+'</div>'+
    '<div class="grid2">'+field('Nhóm hàng','<select id="pGroup">'+groups().map(g=>'<option'+(p.group===g?' selected':'')+'>'+esc(g)+'</option>').join('')+'<option value="__add">＋ Thêm nhóm mới…</option></select>')+
    field('Đơn vị','<select id="pUnit">'+units().map(u=>'<option'+((p.unit||'Gói')===u?' selected':'')+'>'+esc(u)+'</option>').join('')+'<option value="__add">＋ Thêm đơn vị mới…</option></select>')+'</div>'+
    '<div class="grid2">'+field('Giá bán tham khảo','<input id="pSell" class="mn" inputmode="numeric" value="'+esc(p.sellPrice)+'">')+
    field('Trạng thái','<select id="pStatus"><option value="active"'+(p.status==='active'?' selected':'')+'>Đang kinh doanh</option><option value="stopped"'+(p.status==='stopped'?' selected':'')+'>Ngừng kinh doanh</option></select>')+'</div>'+
    '<div class="grid2">'+field('Ngưỡng cảnh báo tồn kho','<input id="pThreshold" type="number" min="0" value="'+esc(p.threshold)+'">')+
    field('Số ngày cảnh báo hết hạn','<input id="pWarn" type="number" min="0" value="'+esc(p.warnDays)+'">')+'</div>'+
    (p.id?'':'<h3 class="sec-title">Lô nhập đầu tiên — không bắt buộc</h3>'+
    '<p class="sub" style="color:var(--muted);font-size:13px;margin:-4px 0 10px">Đang có sẵn hàng thì nhập luôn số lượng ở đây — khỏi phải mở sản phẩm ra nhập lô riêng. Chưa nhập hàng thì cứ để trống.</p>'+
    '<div class="grid2">'+field('Số lượng nhập','<input id="pLotQty" type="number" min="0" step="any" placeholder="Để trống nếu chưa nhập">')+
    field('Giá nhập (theo đơn vị)','<input id="pLotPrice" class="mn" inputmode="numeric">')+'</div>'+
    '<div class="grid2">'+field('Ngày nhập','<input id="pLotDate" type="date" value="'+todayISO()+'">')+
    field('Hạn dùng của lô này','<input id="pLotExpiry" type="date">')+'</div>')+
    '<div class="actions"><button type="submit" class="btn btn-primary">Lưu sản phẩm</button></div></form>');
  taxSel('pGroup','group');taxSel('pUnit','unit');
  let imageData=p.image||'';
  document.getElementById('pImage').addEventListener('change',e=>fileToDataURL(e.target,(d)=>{if(d){imageData=d;const pv=document.getElementById('pPreview');pv.src=d;pv.classList.remove('hidden');}}));
  document.getElementById('pScanBtn').onclick=()=>startScan(code=>fillBarcodeFromScan(code,p.id||null));
  const bcInp=document.getElementById('pBarcode');
  bcInp.addEventListener('change',()=>{const v=bcInp.value.trim();if(v.length>=8){checkBarcodeDup(v,p.id||null);lookupBarcodeName(v);}});
  if(prefillBarcode)lookupBarcodeName(prefillBarcode);
  document.getElementById('fProd').onsubmit=e=>{e.preventDefault();
    const bcVal=document.getElementById('pBarcode').value.trim();
    if(bcVal){const dupB=DB.products.find(x=>x.barcode===bcVal&&x.id!==p.id);
      if(dupB){alert('Mã vạch này đã thuộc sản phẩm "'+dupB.name+'" — mỗi loại sản phẩm chỉ có một mã vạch. Hãy mở sản phẩm đó để nhập thêm hàng, đừng tạo trùng.');return;}}
    const sell=num(document.getElementById('pSell').value);
    if(p.id&&Number(p.sellPrice)!==sell)p.priceHistory.push({date:todayISO(),kind:'Giá bán',price:sell});
    Object.assign(p,{name:document.getElementById('pName').value.trim(),
      code:document.getElementById('pCode').value.trim()||p.code||('HH'+String(DB.products.length+1).padStart(3,'0')),
      barcode:document.getElementById('pBarcode').value.trim(),group:document.getElementById('pGroup').value,
      unit:document.getElementById('pUnit').value||'Gói',sellPrice:sell,
      threshold:num(document.getElementById('pThreshold').value),warnDays:num(document.getElementById('pWarn').value),
      status:document.getElementById('pStatus').value,image:imageData});
    let firstLot=false;
    if(!p.id){p.id=uid();
      const lq=num(document.getElementById('pLotQty').value);
      if(lq>0){const lp=num(document.getElementById('pLotPrice').value);
        p.lots.push({id:uid(),date:document.getElementById('pLotDate').value||todayISO(),qty:lq,importPrice:lp,expiry:document.getElementById('pLotExpiry').value});
        if(lp>0)p.priceHistory.push({date:todayISO(),kind:'Giá nhập',price:lp});
        firstLot=true;}
      DB.products.push(p);}
    save();closeModal();renderAll();toast(firstLot?'Đã lưu sản phẩm + nhập lô đầu tiên.':'Đã lưu sản phẩm.');
    /* v2.5.3: lưu xong ĐÓNG LUÔN — trước đây tự mở tiếp trang chi tiết nên
       người dùng phải tắt thêm 1 lần nữa (Cruz phàn nàn 2026-11-10). */
  };
}
document.getElementById('btnAddProduct').onclick=()=>{const sv=document.getElementById('prodSearch').value.trim();productForm(null,/^\d{8,}$/.test(sv)?sv:'');};
function taxSel(selId,kind){
  const sel=document.getElementById(selId);if(!sel)return;let prev=sel.value;
  sel.addEventListener('change',()=>{
    if(sel.value!=='__add'){prev=sel.value;return;}
    const name=(prompt(kind==='group'?'Tên nhóm hàng mới:':'Tên đơn vị mới:')||'').trim();
    const arr=kind==='group'?groups():units();
    if(!name||arr.some(x=>normVN(x)===normVN(name))){sel.value=prev;if(name)toast('Đã có mục này rồi.');return;}
    ensureTax();(kind==='group'?DB.groups:DB.units).push(name);save();
    sel.innerHTML=(kind==='group'?groups():units()).map(g=>'<option'+(g===name?' selected':'')+'>'+esc(g)+'</option>').join('')+'<option value="__add">'+(kind==='group'?'＋ Thêm nhóm mới…':'＋ Thêm đơn vị mới…')+'</option>';
    prev=name;renderProducts();toast('Đã thêm '+(kind==='group'?'nhóm':'đơn vị')+' mới.');});
}
function taxonomyModal(){
  const row=(kind,val)=>{const n=DB.products.filter(x=>(kind==='group'?x.group:(x.unit||''))===val).length;
    return '<div class="kv"><span>'+esc(val)+' <span style="color:var(--muted)">('+n+' sản phẩm)</span></span><span style="flex:none"><button class="btn btn-small" data-'+kind+'ren="'+esc(val)+'">Đổi tên</button> <button class="btn btn-small" data-'+kind+'del="'+esc(val)+'">Xoá</button></span></div>';};
  openModal('<h3>🏷 Nhóm hàng & đơn vị</h3>'+
    '<div class="field"><label>Nhóm hàng</label>'+groups().map(g=>row('group',g)).join('')+
    '<div style="display:flex;gap:8px;margin-top:10px"><input id="newGroup" placeholder="Tên nhóm mới…"><button class="btn" id="btnAddGroup" style="flex:none">＋ Thêm</button></div></div>'+
    '<div class="field"><label>Đơn vị tính</label>'+units().map(u=>row('unit',u)).join('')+
    '<div style="display:flex;gap:8px;margin-top:10px"><input id="newUnit" placeholder="Tên đơn vị mới…"><button class="btn" id="btnAddUnit" style="flex:none">＋ Thêm</button></div></div>'+
    '<div class="actions"><button class="btn" id="btnCloseTax">Đóng</button></div>');
  document.getElementById('btnCloseTax').onclick=closeModal;
  const addTo=(inputId,kind)=>{const v=document.getElementById(inputId).value.trim();if(!v)return;
    const arr=kind==='group'?groups():units();
    if(arr.some(x=>normVN(x)===normVN(v))){toast('Đã có mục này rồi.');return;}
    ensureTax();(kind==='group'?DB.groups:DB.units).push(v);save();renderProducts();taxonomyModal();};
  document.getElementById('btnAddGroup').onclick=()=>addTo('newGroup','group');
  document.getElementById('btnAddUnit').onclick=()=>addTo('newUnit','unit');
  const wire=(kind)=>{
    modalBox.querySelectorAll('[data-'+kind+'del]').forEach(b=>b.onclick=()=>{const v=b.dataset[kind+'del'];
      if(DB.products.some(x=>(kind==='group'?x.group:(x.unit||''))===v)){toast('Đang có sản phẩm dùng mục này — không xoá được.');return;}
      if(confirm('Xoá “'+v+'”?')){ensureTax();const arr=kind==='group'?DB.groups:DB.units;const i=arr.indexOf(v);if(i>=0)arr.splice(i,1);
        if(kind==='group'&&prodGroupFilter===v)prodGroupFilter='';save();renderProducts();taxonomyModal();}});
    modalBox.querySelectorAll('[data-'+kind+'ren]').forEach(b=>b.onclick=()=>{const v=b.dataset[kind+'ren'];
      const nv=(prompt('Tên mới cho “'+v+'”:',v)||'').trim();if(!nv||nv===v)return;
      const arr=kind==='group'?groups():units();
      if(arr.some(x=>normVN(x)===normVN(nv))){toast('Đã có mục này rồi.');return;}
      ensureTax();const list=kind==='group'?DB.groups:DB.units;const i=list.indexOf(v);if(i>=0)list[i]=nv;
      DB.products.forEach(x=>{if(kind==='group'&&x.group===v)x.group=nv;if(kind==='unit'&&(x.unit||'')===v)x.unit=nv;});
      if(kind==='group'&&prodGroupFilter===v)prodGroupFilter=nv;
      save();renderProducts();taxonomyModal();toast('Đã đổi tên.');});
  };
  wire('group');wire('unit');
}
document.getElementById('btnTaxonomy').onclick=taxonomyModal;

function openProduct(id){
  const p=DB.products.find(x=>x.id===id);if(!p)return;
  const st=stockOf(p),alerts=productAlerts(p);
  const lots=(p.lots||[]).slice().sort((a,b)=>String(a.expiry||'9999').localeCompare(String(b.expiry||'9999')));
  openModal('<h2>'+esc(p.name)+'</h2>'+
    (p.image?'<img class="preview" src="'+p.image+'" style="max-width:100%;border-radius:10px">':'')+
    '<div class="kv"><span>Mã / Barcode</span><b>'+esc(p.code||'—')+(p.barcode?' · '+esc(p.barcode):'')+'</b></div>'+
    '<div class="kv"><span>Nhóm / Đơn vị</span><b>'+esc(p.group||'')+' · '+esc(p.unit||'')+'</b></div>'+
    '<div class="kv"><span>Giá bán tham khảo</span><b>'+fmtMoney(p.sellPrice)+'</b></div>'+
    '<div class="kv"><span>Trạng thái</span><b>'+(p.status==='stopped'?'Ngừng kinh doanh':'Đang kinh doanh')+'</b></div>'+
    '<div class="kv"><span>Tồn kho hiện tại</span><b>'+st+' '+esc(p.unit||'')+'</b></div>'+
    alerts.map(a=>'<span class="badge '+((a.kind==='expired'||a.kind==='out')?'red':'amber')+'">'+esc(a.label)+'</span> ').join('')+
    '<h3 class="sec-title">Các lô hàng ('+lots.length+')</h3>'+
    (lots.length?lots.map(l=>{const du=l.expiry?daysUntil(l.expiry):null;
      return '<div class="sub-block"><div class="head"><b>Lô nhập '+fmtDate(l.date)+'</b><span class="money">'+fmtMoney(l.importPrice)+'/'+esc(p.unit||'')+'</span></div>'+
      '<div class="sub" style="color:var(--muted);font-size:13px">Số lượng: '+l.qty+' · Hạn dùng: '+(l.expiry?fmtDate(l.expiry)+(du!==null?' ('+(du<0?'đã hết hạn '+(-du)+' ngày':'còn '+du+' ngày')+')':''):'—')+'</div>'+
      '<div class="actions"><button class="btn btn-small" data-lotdec="'+l.id+'">− Bớt 1 (bán / huỷ)</button><button class="btn btn-small btn-danger" data-lotdel="'+l.id+'">Xoá lô</button></div></div>';}).join('')
      :'<div class="empty">Chưa có lô nhập nào.</div>')+
    '<div class="actions"><button class="btn btn-primary" id="btnLot">＋ Nhập thêm lô</button><button class="btn" id="btnEditP">✏️ Sửa</button><button class="btn" id="btnStatusP">'+(p.status==='stopped'?'▶ Kinh doanh lại':'⏸ Ngừng kinh doanh')+'</button></div>'+
    '<h3 class="sec-title">Lịch sử thay đổi giá</h3>'+
    ((p.priceHistory&&p.priceHistory.length)?p.priceHistory.slice().reverse().map(h=>'<div class="kv"><span>'+fmtDate(h.date)+' · '+esc(h.kind)+'</span><b>'+fmtMoney(h.price)+'</b></div>').join(''):'<div class="sub" style="color:var(--muted)">Chưa có thay đổi giá.</div>')+
    '<div class="actions"><button class="btn btn-danger" id="btnDelP">🗑 Xoá sản phẩm</button></div>');
  document.getElementById('btnEditP').onclick=()=>productForm(p);
  document.getElementById('btnStatusP').onclick=()=>{p.status=(p.status==='stopped')?'active':'stopped';save();renderAll();openProduct(id);toast(p.status==='stopped'?'Đã ngừng kinh doanh sản phẩm.':'Đã mở kinh doanh lại.');};
  document.getElementById('btnLot').onclick=()=>lotForm(p);
  document.getElementById('btnDelP').onclick=()=>{if(confirm('Xoá hẳn sản phẩm “'+p.name+'”?')){armUndo();DB.products=DB.products.filter(x=>x.id!==p.id);save();closeModal();renderAll();toastUndo('Đã xoá sản phẩm.');}};
  modalBox.querySelectorAll('[data-lotdec]').forEach(b=>b.onclick=()=>{const l=p.lots.find(x=>x.id===b.dataset.lotdec);if(l&&l.qty>0){l.qty--;save();openProduct(id);renderAll();}});
  modalBox.querySelectorAll('[data-lotdel]').forEach(b=>b.onclick=()=>{if(confirm('Xoá lô này?')){armUndo();p.lots=p.lots.filter(x=>x.id!==b.dataset.lotdel);save();openProduct(id);renderAll();toastUndo('Đã xoá lô hàng.');}});
}
function lotForm(p){
  openModal('<h2>Nhập lô mới — '+esc(p.name)+'</h2><form id="fLot">'+
    field('Ngày nhập','<input id="lDate" type="date" value="'+todayISO()+'">')+
    '<div class="grid2">'+field('Số lượng *','<input id="lQty" type="number" min="0" step="any" required>')+
    field('Giá nhập (theo '+esc(p.unit||'đơn vị')+')','<input id="lPrice" class="mn" inputmode="numeric">')+'</div>'+
    field('Hạn sử dụng của lô này','<input id="lExpiry" type="date">')+
    '<div class="actions"><button class="btn btn-primary" type="submit">Lưu lô</button></div></form>');
  document.getElementById('fLot').onsubmit=e=>{e.preventDefault();
    const price=num(document.getElementById('lPrice').value);
    p.lots.push({id:uid(),date:document.getElementById('lDate').value,qty:num(document.getElementById('lQty').value),
      importPrice:price,expiry:document.getElementById('lExpiry').value});
    const last=p.priceHistory[p.priceHistory.length-1];
    if(price>0&&(!last||last.kind!=='Giá nhập'||last.price!==price))p.priceHistory.push({date:todayISO(),kind:'Giá nhập',price});
    save();renderAll();toast('Đã nhập lô.');openProduct(p.id);};
}

/* ---------- quét barcode ----------
   3 tầng: (1) BarcodeDetector có sẵn của trình duyệt; (2) nếu máy không có
   BarcodeDetector (nhiều máy Android/iPhone) thì tải bộ quét Quagga2 quét
   trực tiếp qua camera; (3) nếu không mở được camera trực tiếp thì chụp ảnh
   mã vạch rồi giải mã từ ảnh. */
/* Nơi nhận kết quả quét: mặc định là onBarcode (tìm ở tab Sản phẩm);
   form sản phẩm gọi startScan(cb) để nhận mã về ô Barcode của form. */
let _scanCb=null;
function dispatchScan(code){const cb=_scanCb;_scanCb=null;if(cb)cb(code);else onBarcode(code);}
function onBarcode(code){
  document.getElementById('prodSearch').value=code;prodGroupFilter='';renderProducts();
  const hit=DB.products.find(p=>p.barcode===code);
  toast(hit?'Tìm thấy: '+hit.name:'Chưa có sản phẩm với barcode này — bấm Thêm và điền sẵn mã.');
}
/* Mỗi loại sản phẩm có đúng 1 mã vạch của nhà sản xuất: quét trúng mã
   đã có trong kho thì coi chừng tạo trùng. */
function checkBarcodeDup(code,selfId){
  const dup=DB.products.find(x=>x.barcode===code&&x.id!==selfId);
  if(dup)toast('⚠ Mã này đã thuộc sản phẩm "'+dup.name+'"');
  return dup;
}
function fillBarcodeFromScan(code,selfId){
  const inp=document.getElementById('pBarcode');if(!inp)return;
  inp.value=code;
  const dup=checkBarcodeDup(code,selfId);
  if(dup){if(confirm('Mã vạch này đã thuộc sản phẩm "'+dup.name+'".\nMở sản phẩm đó để nhập thêm hàng thay vì tạo trùng?')){closeModal();openProduct(dup.id);}return;}
  toast('Đã điền mã vạch: '+code);
  lookupBarcodeName(code);
}
/* Mã MỚI chưa có trong kho: thử tra tên sản phẩm từ kho dữ liệu mã vạch
   mở (Open Food Facts, miễn phí, cần mạng) để điền sẵn ô Tên — chỉ là
   gợi ý cho người dùng sửa lại; GIÁ luôn do người dùng tự nhập. Tra
   không thấy / mất mạng thì im lặng bỏ qua. */
function lookupBarcodeName(code){
  const nameEl=document.getElementById('pName');
  if(!nameEl||nameEl.value.trim()||!/^\d{8,}$/.test(code||''))return;
  let ctl=null,to=0;
  if('AbortController' in window){ctl=new AbortController();to=setTimeout(()=>ctl.abort(),4500);}
  fetch('https://world.openfoodfacts.org/api/v2/product/'+encodeURIComponent(code)+'?fields=product_name,product_name_vi,brands',ctl?{signal:ctl.signal}:undefined)
    .then(r=>r.json()).then(j=>{if(to)clearTimeout(to);
      const pr=j&&j.product;
      const nm=pr?((pr.product_name_vi||pr.product_name||'')+'').trim():'';
      /* Không thấy trong kho chung: nói rõ lý do kẻo tưởng app hỏng —
         mã vạch thường (EAN-13) chỉ chứa dãy số định danh, KHÔNG chứa
         tên/giá/hạn dùng; tên do nơi bán tự lưu theo mã đó. */
      if(!nm){toast('Mã vạch chỉ là dãy số nên hàng mới chưa có sẵn tên — tự đặt tên 1 lần này, lần sau quét là app nhận ngay.');return;}
      const cur=document.getElementById('pName');
      if(cur&&!cur.value.trim()){cur.value=nm;toast('Đã điền tên gợi ý từ mã vạch — kiểm tra lại nếu chưa đúng; giá bán tự nhập nhé.');}
    }).catch(()=>{if(to)clearTimeout(to);});
}
/* Chỉ giữ các định dạng dài (EAN-13, UPC-A, Code128): các reader định dạng ngắn
   (EAN-8/UPC-E) dễ đọc nhầm một đoạn của mã dài thành mã ngắn sai. */
const SCAN_READERS=['ean_reader','upc_reader','code_128_reader'];
let _quaggaLoading=null;
function loadQuagga(){
  if(window.Quagga)return Promise.resolve();
  if(_quaggaLoading)return _quaggaLoading;
  /* Bộ quét Quagga2 đóng gói sẵn cạnh app (quagga.min.js) — không cần mạng. */
  _quaggaLoading=loadScript('quagga.min.js')
    .catch(e=>{_quaggaLoading=null;throw e;});
  return _quaggaLoading;
}
function scanByPhoto(){
  loadQuagga().then(()=>{
    const inp=document.getElementById('scanPhoto');inp.value='';
    inp.onchange=()=>{const f=inp.files&&inp.files[0];if(!f)return;
      const r=new FileReader();
      r.onload=()=>{Quagga.decodeSingle({src:r.result,numOfWorkers:0,inputStream:{size:1600},
          decoder:{readers:SCAN_READERS},locate:true},
        res=>{const code=res&&res.codeResult&&res.codeResult.code;
          if(code)dispatchScan(code);
          else toast('Không đọc được mã trong ảnh — chụp gần, rõ và đủ sáng hơn, hoặc gõ barcode vào ô tìm kiếm.');});};
      r.readAsDataURL(f);};
    inp.click();
  }).catch(()=>toast('Không tải được bộ quét (cần có mạng) — hãy gõ barcode vào ô tìm kiếm.'));
}
function stopQuaggaScan(){
  try{Quagga.offDetected();Quagga.stop();}catch(e){}
  document.getElementById('scanOverlay').classList.add('hidden');
}
function scanLiveFallback(){
  loadQuagga().then(()=>{
    const ov=document.getElementById('scanOverlay');ov.classList.remove('hidden');
    document.getElementById('btnScanClose').onclick=()=>{_scanCb=null;stopQuaggaScan();};
    let done=false;
    Quagga.onDetected(res=>{if(done)return;const code=res&&res.codeResult&&res.codeResult.code;
      if(!code)return;done=true;stopQuaggaScan();dispatchScan(code);});
    Quagga.init({inputStream:{type:'LiveStream',target:document.getElementById('scanView'),
        constraints:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}}},
      locator:{patchSize:'medium',halfSample:true},numOfWorkers:2,frequency:10,
      decoder:{readers:SCAN_READERS},locate:true},
      err=>{if(err){ov.classList.add('hidden');toast('Không mở được camera trực tiếp — chuyển sang chụp ảnh mã vạch.');scanByPhoto();return;}
        Quagga.start();});
  }).catch(()=>scanByPhoto());
}
async function startScan(cb){
  _scanCb=cb||null;
  const hasCam=!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
  if(hasCam&&'BarcodeDetector' in window){
    const v=document.getElementById('scanVideo');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      v.srcObject=stream;v.classList.remove('hidden');await v.play();
      const det=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']});
      toast('Đưa mã vạch vào camera… chạm màn hình để huỷ.');
      const tick=async()=>{ if(v.classList.contains('hidden'))return;
        try{const codes=await det.detect(v);if(codes&&codes.length){
          const code=codes[0].rawValue;stopScan();dispatchScan(code);return;}}catch(e){}
        requestAnimationFrame(()=>setTimeout(tick,250));};
      tick();
      v.onclick=()=>stopScan(true);
      function stopScan(cancel){if(cancel)_scanCb=null;v.classList.add('hidden');stream.getTracks().forEach(t=>t.stop());}
    }catch(e){_scanCb=null;toast('Không mở được camera — hãy kiểm tra quyền camera của trình duyệt.');}
    return;
  }
  if(hasCam){scanLiveFallback();return;}
  scanByPhoto();
}
document.getElementById('btnScan').onclick=()=>startScan(null);

/* ---------- CÔNG NỢ KHÁCH HÀNG ---------- */
let villageFilter='',custDebtOnly=false;
function renderDebts(){
  const total=DB.debts.reduce((s,d)=>s+debtRemain(d),0);
  const debtors=new Set(DB.debts.filter(d=>debtRemain(d)>0).map(d=>d.customerId)).size;
  document.getElementById('debtCards').innerHTML=
    statCard('i-receipt','red','Tổng nợ toàn cửa hàng',fmtMoney(total),total>0?'red':'')+
    statCard('i-users','blue','Số khách đang nợ',debtors)+
    statCard('i-pin','amber','Số khoản nợ chưa trả hết',DB.debts.filter(d=>debtRemain(d)>0).length);
  document.getElementById('villageChips').innerHTML=
    '<button class="chip'+(villageFilter===''?' active':'')+'" data-v="">Tất cả thôn</button>'+
    DB.villages.map(v=>'<button class="chip'+(villageFilter===v.id?' active':'')+'" data-v="'+v.id+'">'+esc(v.name)+'</button>').join('');
  const q=normVN(document.getElementById('custSearch').value||'');
  const groups={};
  for(const c of DB.customers){
    if(villageFilter&&c.villageId!==villageFilter)continue;
    if(q&&!(normVN(c.name).includes(q)||(c.phone||'').includes(q)))continue;
    if(custDebtOnly&&customerDebtTotal(c.id)<=0)continue;
    (groups[c.villageId]=groups[c.villageId]||[]).push(c);
  }
  Object.values(groups).forEach(arr=>arr.sort((a,b)=>customerDebtTotal(b.id)-customerDebtTotal(a.id)||a.name.localeCompare(b.name,'vi')));
  const html=Object.keys(groups).map(vid=>{
    const v=village(vid);
    return '<div class="group-head">'+(v?esc(v.name):'(Chưa rõ thôn)')+'</div><div class="list">'+
      groups[vid].map(c=>{const t=customerDebtTotal(c.id);
        return '<div class="row" data-cust="'+c.id+'"><span class="avatar">'+esc(c.name.trim().charAt(0).toUpperCase()||'?')+'</span><div class="grow"><div class="title">'+esc(c.name)+'</div>'+
        '<div class="sub">'+esc(c.phone||'')+(c.note?' · '+esc(c.note):'')+'</div></div>'+
        (t>0?'<span class="money red">Nợ '+fmtMoney(t)+'</span>':'<span class="badge green">Không nợ</span>')+
        (c.phone?'<a class="btn btn-small tel-btn" href="tel:'+esc(c.phone)+'" data-tel="1" title="Gọi cho khách">📞 Gọi</a>':'')+
        (t>0?'<button class="btn btn-small btn-primary qp-btn" data-qp="'+c.id+'">Trả nợ</button>':'')+'</div>';}).join('')+'</div>';
  }).join('');
  document.getElementById('customerList').innerHTML=html||'<div class="empty">Chưa có khách hàng nào. Bấm “＋ Thêm khách”.</div>';
  renderDebtStats();
}
function renderDebtStats(){
  const rows=DB.customers.map(c=>({c,t:customerDebtTotal(c.id)})).filter(r=>r.t>0).sort((a,b)=>b.t-a.t);
  const perCust=rows.length?'<div style="overflow-x:auto"><table class="stats"><tr><th>Khách</th><th>Thôn</th><th>Còn nợ</th></tr>'+
    rows.map(r=>'<tr><td>'+esc(r.c.name)+'</td><td>'+esc((village(r.c.villageId)||{}).name||'')+'</td><td class="money red">'+fmtMoney(r.t)+'</td></tr>').join('')+'</table></div>'
    :'<div class="empty">Không ai đang nợ.</div>';
  const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));}
  const inc=days.map(d=>DB.debts.filter(x=>String(x.datetime).startsWith(d)).reduce((s,x)=>s+(Number(x.total)||0),0));
  const col=days.map(d=>DB.cash.filter(x=>x.source==='debtPayment'&&String(x.datetime).startsWith(d)).reduce((s,x)=>s+(Number(x.amount)||0),0));
  const max=Math.max(1,...inc,...col);
  const bars=days.map((d,i)=>'<div class="bar-row"><span class="day">'+fmtDate(d)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+Math.round(inc[i]/max*100)+'%"></div></div><span>'+fmtMoney(inc[i])+' nợ mới</span></div>'+
    '<div class="bar-row"><span class="day"></span><div class="bar-track"><div class="bar-fill collect" style="width:'+Math.round(col[i]/max*100)+'%"></div></div><span>'+fmtMoney(col[i])+' đã thu</span></div>').join('');
  document.getElementById('debtStats').innerHTML='<h3 style="margin:6px 0">Tổng nợ từng khách</h3>'+perCust+
    '<h3 style="margin:16px 0 6px">Nợ phát sinh & tiền thu hồi — 7 ngày gần nhất</h3><div class="card">'+bars+'</div>';
}
document.getElementById('custSearch').addEventListener('input',renderDebts);
document.getElementById('villageChips').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(b){villageFilter=b.dataset.v;renderDebts();}});
document.getElementById('customerList').addEventListener('click',e=>{
  if(e.target.closest('[data-tel]'))return;
  const qp=e.target.closest('[data-qp]');
  if(qp){const cid=qp.dataset.qp;const d=DB.debts.filter(x=>x.customerId===cid&&debtRemain(x)>0).sort((a,b)=>String(a.datetime).localeCompare(String(b.datetime)))[0];
    if(d)payDebtForm(d,()=>openCustomer(cid));return;}
  const r=e.target.closest('[data-cust]');if(r)openCustomer(r.dataset.cust);});
document.getElementById('btnVillages').onclick=()=>{
  openModal('<h2>Quản lý thôn</h2><div id="vList">'+
    DB.villages.map(v=>'<div class="kv"><span>'+esc(v.name)+'</span><span><button class="btn btn-small" data-vren="'+v.id+'">Đổi tên</button> <button class="btn btn-small btn-danger" data-vdel="'+v.id+'">Xoá</button></span></div>').join('')+
    '</div><form id="fVillage" class="actions"><input id="vName" class="input grow" placeholder="Tên thôn mới, VD: Thôn 6" required><button class="btn btn-primary">＋ Thêm thôn</button></form>');
  document.getElementById('fVillage').onsubmit=e=>{e.preventDefault();DB.villages.push({id:uid(),name:document.getElementById('vName').value.trim()});save();closeModal();renderAll();toast('Đã thêm thôn.');};
  modalBox.querySelectorAll('[data-vren]').forEach(b=>b.onclick=()=>{const v=village(b.dataset.vren);const n=prompt('Tên thôn mới:',v.name);if(n&&n.trim()){v.name=n.trim();save();closeModal();renderAll();}});
  modalBox.querySelectorAll('[data-vdel]').forEach(b=>b.onclick=()=>{if(DB.customers.some(c=>c.villageId===b.dataset.vdel)){toast('Thôn này đang có khách — chuyển khách sang thôn khác trước.');return;}if(confirm('Xoá thôn này?')){DB.villages=DB.villages.filter(v=>v.id!==b.dataset.vdel);save();closeModal();renderAll();}});
};
function customerForm(c){
  const isNew=!(c&&c.id);
  c=c||{name:'',villageId:(DB.villages[0]||{}).id||'',phone:'',note:''};
  openModal('<h2>'+(c.id?'Sửa khách hàng':'Thêm khách hàng')+'</h2><form id="fCust">'+
    field('Họ tên *','<input id="cName" required value="'+esc(c.name)+'">')+
    field('Thôn','<select id="cVillage">'+DB.villages.map(v=>'<option value="'+v.id+'"'+(c.villageId===v.id?' selected':'')+'>'+esc(v.name)+'</option>').join('')+'</select>')+
    field('Số điện thoại','<input id="cPhone" type="tel" value="'+esc(c.phone||'')+'">')+
    field('Địa chỉ hoặc ghi chú nhận diện','<textarea id="cNote" rows="2">'+esc(c.note||'')+'</textarea>')+
    (isNew?'<h3 class="sec-title">Khoản nợ đầu tiên — không bắt buộc</h3>'+
      '<p class="sub" style="color:var(--muted);font-size:13px;margin:-4px 0 10px">Khách mua nợ ngay thì điền tiền vào đây, app ghi luôn một lượt — khỏi phải mở hồ sơ ghi nợ riêng. Chưa nợ thì cứ để trống.</p>'+
      field('Tổng tiền nợ','<input id="cDebtTotal" class="mn" inputmode="numeric" placeholder="Để trống nếu khách chưa nợ">')+
      field('Nợ gì (ghi chú)','<input id="cDebtNote" placeholder="VD: 2 thùng bia + 1 bao gạo">')+
      field('Ngày giờ phát sinh','<input id="cDebtWhen" type="datetime-local" value="'+nowLocal()+'">')+
      field('Ảnh / video bằng chứng','<input id="cDebtEv" type="file" accept="image/*,video/*">')
    :'')+
    '<div class="actions"><button class="btn btn-primary" type="submit">Lưu</button></div></form>');
  let evData='',evName='';
  if(isNew){const evInp=document.getElementById('cDebtEv');if(evInp)evInp.addEventListener('change',e=>fileToDataURL(e.target,(d,n)=>{evData=d||'';evName=n||'';}));}
  document.getElementById('fCust').onsubmit=e=>{e.preventDefault();
    Object.assign(c,{name:document.getElementById('cName').value.trim(),villageId:document.getElementById('cVillage').value,
      phone:document.getElementById('cPhone').value.trim(),note:document.getElementById('cNote').value.trim()});
    let firstDebt=false;
    if(!c.id){c.id=uid();DB.customers.push(c);
      if(isNew){const tot=num(document.getElementById('cDebtTotal').value);
        if(tot>0){DB.debts.push({id:uid(),customerId:c.id,datetime:document.getElementById('cDebtWhen').value||nowLocal(),
          note:document.getElementById('cDebtNote').value.trim(),total:tot,evidence:evData,evidenceName:evName,payments:[]});firstDebt=true;}}}
    save();closeModal();renderAll();
    if(firstDebt){toast('Đã lưu khách hàng + ghi khoản nợ đầu tiên.');openCustomer(c.id);}
    else toast('Đã lưu khách hàng.');};
}
document.getElementById('btnAddCustomer').onclick=()=>customerForm(null);

function openCustomer(id){
  const c=customer(id);if(!c)return;
  const debts=DB.debts.filter(d=>d.customerId===id).slice().sort((a,b)=>String(b.datetime).localeCompare(String(a.datetime)));
  openModal('<h2>'+esc(c.name)+'</h2>'+
    '<div class="kv"><span>Thôn</span><b>'+esc((village(c.villageId)||{}).name||'—')+'</b></div>'+
    '<div class="kv"><span>Điện thoại</span><b>'+esc(c.phone||'—')+'</b></div>'+
    (c.note?'<div class="kv"><span>Nhận diện</span><b>'+esc(c.note)+'</b></div>':'')+
    '<div class="kv"><span>Tổng còn nợ</span><b class="money red">'+fmtMoney(customerDebtTotal(id))+'</b></div>'+
    '<div class="actions"><button class="btn btn-primary" id="btnDebt">＋ Ghi khoản nợ mới</button>'+(customerDebtTotal(id)>0?'<button class="btn" id="btnRemind">📋 Nhắc nợ</button>':'')+'<button class="btn" id="btnEditC">✏️ Sửa hồ sơ</button></div>'+
    '<h3 class="sec-title">Các khoản nợ ('+debts.length+')</h3>'+
    (debts.length?debts.map(d=>{const rem=debtRemain(d);
      return '<div class="sub-block"><div class="head"><b>'+fmtDT(d.datetime)+'</b><span class="money '+(rem>0?'red':'')+'">'+(rem>0?'Còn '+fmtMoney(rem):'Đã trả hết ✓')+'</span></div>'+
      '<div>'+esc(d.note||'(không ghi chú)')+'</div><div class="sub" style="color:var(--muted);font-size:13px">Tổng nợ: '+fmtMoney(d.total)+' · Đã trả: '+fmtMoney(debtPaid(d))+'</div>'+
      (d.evidence?(String(d.evidence).startsWith('data:video')?'<video src="'+d.evidence+'" controls style="max-width:100%;border-radius:10px;margin-top:6px"></video>':'<img class="preview" src="'+d.evidence+'" style="max-width:100%;border-radius:10px;margin-top:6px">'):'')+
      (d.payments&&d.payments.length?'<div style="margin-top:6px">'+payHistoryHtml(d)+'</div>':'')+
      '<div class="actions">'+(rem>0?'<button class="btn btn-small btn-primary" data-pay="'+d.id+'">Ghi trả nợ</button>':'')+
      '<button class="btn btn-small btn-danger" data-debtdel="'+d.id+'">Xoá khoản nợ</button></div></div>';}).join('')
      :'<div class="empty">Khách này chưa có khoản nợ nào.</div>'));
  document.getElementById('btnEditC').onclick=()=>customerForm(c);
  const btnR=document.getElementById('btnRemind');
  if(btnR)btnR.onclick=()=>{
    const unpaid=DB.debts.filter(d=>d.customerId===id&&debtRemain(d)>0).sort((a,b)=>String(a.datetime).localeCompare(String(b.datetime)));
    const msg='Xin chào '+c.name+', cửa hàng xin nhắc khoản nợ hiện tại là '+fmtMoney(customerDebtTotal(id))+' gồm:\n'+
      unpaid.map(d=>'- '+fmtDate(d.datetime)+': '+(d.note||'mua hàng')+' — còn '+fmtMoney(debtRemain(d))).join('\n')+
      '\nBạn vui lòng thanh toán giúp cửa hàng nhé. Xin cảm ơn!';
    const done=()=>toast('Đã sao chép tin nhắc nợ — dán vào Zalo hoặc SMS để gửi.');
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(msg).then(done).catch(()=>{prompt('Sao chép tin nhắc nợ:',msg);});
    else prompt('Sao chép tin nhắc nợ:',msg);};
  document.getElementById('btnDebt').onclick=()=>debtForm(c);
  modalBox.querySelectorAll('[data-pay]').forEach(b=>b.onclick=()=>payDebtForm(DB.debts.find(d=>d.id===b.dataset.pay),()=>openCustomer(id)));
  modalBox.querySelectorAll('[data-debtdel]').forEach(b=>b.onclick=()=>{if(confirm('Xoá khoản nợ này và lịch sử trả của nó? Các giao dịch thu tự động kèm theo cũng sẽ bị xoá.')){
    const d=DB.debts.find(x=>x.id===b.dataset.debtdel);
    (d.payments||[]).forEach(p=>{DB.cash=DB.cash.filter(x=>!(x.source==='debtPayment'&&x.sourceRef===p.id));});
    armUndo();DB.debts=DB.debts.filter(x=>x.id!==d.id);save();openCustomer(id);renderAll();toastUndo('Đã xoá khoản nợ.');}});
}
function debtForm(c){
  openModal('<h2>Ghi nợ mới — '+esc(c.name)+'</h2><form id="fDebt">'+
    field('Ngày giờ phát sinh','<input id="dWhen" type="datetime-local" value="'+nowLocal()+'">')+
    field('Nợ gì (ghi chú)','<input id="dNote" placeholder="VD: 2 thùng bia + 1 bao gạo">')+
    field('Tổng tiền nợ *','<input id="dTotal" class="mn" inputmode="numeric" required>')+
    field('Ảnh / video bằng chứng','<input id="dEv" type="file" accept="image/*,video/*">')+
    '<div class="actions"><button class="btn btn-primary" type="submit">Lưu khoản nợ</button></div></form>');
  let evData='',evName='';
  document.getElementById('dEv').addEventListener('change',e=>fileToDataURL(e.target,(d,n)=>{evData=d||'';evName=n||'';}));
  document.getElementById('fDebt').onsubmit=e=>{e.preventDefault();
    DB.debts.push({id:uid(),customerId:c.id,datetime:document.getElementById('dWhen').value,
      note:document.getElementById('dNote').value.trim(),total:num(document.getElementById('dTotal').value),
      evidence:evData,evidenceName:evName,payments:[]});
    save();renderAll();toast('Đã ghi khoản nợ.');openCustomer(c.id);};
}
function payDebtForm(d,back){
  if(!d)return;
  openModal('<h2>Khách trả nợ</h2>'+
    '<div class="kv"><span>Khoản nợ</span><b>'+fmtDT(d.datetime)+' · '+esc(d.note||'')+'</b></div>'+
    '<div class="kv"><span>Còn lại</span><b class="money red">'+fmtMoney(debtRemain(d))+'</b></div><form id="fPay">'+
    field('Ngày trả','<input id="payDate" type="date" value="'+todayISO()+'">')+
    field('Số tiền trả *','<input id="payAmt" class="mn" inputmode="numeric" required value="'+debtRemain(d)+'">')+
    field('Phương thức trả','<select id="payMethod"><option>Tiền mặt</option><option>Chuyển khoản</option><option>Khác</option></select>')+
    field('Người thực hiện (ai thu tiền)','<input id="payPerson" placeholder="VD: Chủ cửa hàng, Thu ngân…">')+
    '<p style="color:var(--muted);font-size:13px">Khoản thu tương ứng sẽ tự được ghi vào mục Thu chi (không ghi trùng).</p>'+
    '<div class="actions"><button class="btn btn-primary" type="submit">Lưu lần trả</button></div></form>');
  document.getElementById('fPay').onsubmit=e=>{e.preventDefault();
    const amt=num(document.getElementById('payAmt').value);if(amt<=0)return;
    const pay={id:uid(),date:document.getElementById('payDate').value,amount:amt,method:document.getElementById('payMethod').value,person:document.getElementById('payPerson').value.trim()};
    d.payments.push(pay);
    if(!DB.cash.some(x=>x.source==='debtPayment'&&x.sourceRef===pay.id)){
      const c=customer(d.customerId);
      DB.cash.push({id:uid(),datetime:pay.date+'T'+nowLocal().slice(11),kind:'thu',type:'Khách trả nợ',amount:amt,
        content:'Thu nợ của '+(c?c.name:'khách')+' ('+fmtDT(d.datetime)+')',person:pay.person,evidence:'',note:'',
        source:'debtPayment',sourceRef:pay.id});
    }
    save();renderAll();toast('Đã ghi trả nợ + tự ghi khoản thu.');if(back)back();};
}

/* ---------- NHÀ CUNG CẤP & HOÁ ĐƠN ---------- */
function renderSuppliers(){
  const total=DB.invoices.reduce((s,i)=>s+invRemain(i),0);
  document.getElementById('supCards').innerHTML=
    statCard('i-truck','amber','Còn nợ nhà cung cấp',fmtMoney(total),total>0?'amber':'')+
    statCard('i-factory','blue','Số nhà cung cấp',DB.suppliers.length)+
    statCard('i-receipt','red','Số hoá đơn chưa trả hết',DB.invoices.filter(i=>invRemain(i)>0).length);
  const q=normVN(document.getElementById('supSearch').value||'');
  const list=DB.suppliers.filter(s=>!q||normVN(s.name).includes(q)||(s.phone||'').includes(q));
  document.getElementById('supplierList').innerHTML=list.length?list.map(s=>{
    const invs=DB.invoices.filter(i=>i.supplierId===s.id);
    const rem=invs.reduce((t,i)=>t+invRemain(i),0);
    return '<div class="row" data-sup="'+s.id+'"><span class="dot-ico blue" style="width:44px;height:44px;border-radius:12px">'+ic('i-truck')+'</span><div class="grow"><div class="title">'+esc(s.name)+'</div>'+
      '<div class="sub">'+esc(s.phone||'')+(s.address?' · '+esc(s.address):'')+' · '+invs.length+' hoá đơn</div></div>'+
      (rem>0?'<span class="money red">Còn nợ '+fmtMoney(rem)+'</span>':'<span class="badge green">Đã trả hết</span>')+
      (s.phone?'<a class="btn btn-small tel-btn" href="tel:'+esc(s.phone)+'" data-tel="1" title="Gọi nhà cung cấp">📞 Gọi</a>':'')+'</div>';
  }).join(''):'<div class="empty">Chưa có nhà cung cấp nào. Bấm “＋ Thêm nhà cung cấp”.</div>';
}
document.getElementById('supSearch').addEventListener('input',renderSuppliers);
document.getElementById('supplierList').addEventListener('click',e=>{if(e.target.closest('[data-tel]'))return;const r=e.target.closest('[data-sup]');if(r)openSupplier(r.dataset.sup);});
function supplierForm(s){
  s=s||{name:'',phone:'',address:'',note:''};
  openModal('<h2>'+(s.id?'Sửa nhà cung cấp':'Thêm nhà cung cấp')+'</h2><form id="fSup">'+
    field('Tên nhà cung cấp *','<input id="sName" required value="'+esc(s.name)+'">')+
    field('Số điện thoại','<input id="sPhone" type="tel" value="'+esc(s.phone||'')+'">')+
    field('Địa chỉ','<input id="sAddr" value="'+esc(s.address||'')+'">')+
    field('Ghi chú','<textarea id="sNote" rows="2">'+esc(s.note||'')+'</textarea>')+
    '<div class="actions"><button class="btn btn-primary" type="submit">Lưu</button></div></form>');
  document.getElementById('fSup').onsubmit=e=>{e.preventDefault();
    Object.assign(s,{name:document.getElementById('sName').value.trim(),phone:document.getElementById('sPhone').value.trim(),
      address:document.getElementById('sAddr').value.trim(),note:document.getElementById('sNote').value.trim()});
    if(!s.id){s.id=uid();DB.suppliers.push(s);} save();closeModal();renderAll();toast('Đã lưu nhà cung cấp.');};
}
document.getElementById('btnAddSupplier').onclick=()=>supplierForm(null);
function openSupplier(id){
  const s=supplier(id);if(!s)return;
  const invs=DB.invoices.filter(i=>i.supplierId===id).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  openModal('<h2>'+esc(s.name)+'</h2>'+
    '<div class="kv"><span>Điện thoại</span><b>'+esc(s.phone||'—')+'</b></div>'+
    '<div class="kv"><span>Địa chỉ</span><b>'+esc(s.address||'—')+'</b></div>'+
    (s.note?'<div class="kv"><span>Ghi chú</span><b>'+esc(s.note)+'</b></div>':'')+
    '<div class="kv"><span>Tổng còn nợ</span><b class="money red">'+fmtMoney(invs.reduce((t,i)=>t+invRemain(i),0))+'</b></div>'+
    '<div class="actions"><button class="btn btn-primary" id="btnInv">＋ Thêm hoá đơn nhập</button><button class="btn" id="btnEditS">✏️ Sửa hồ sơ</button></div>'+
    '<h3 class="sec-title">Hoá đơn ('+invs.length+')</h3>'+
    (invs.length?invs.map(i=>{const rem=invRemain(i);
      return '<div class="sub-block"><div class="head"><b>Hoá đơn ngày '+fmtDate(i.date)+'</b><span class="money '+(rem>0?'red':'')+'">'+(rem>0?'Còn nợ '+fmtMoney(rem):'Đã trả hết ✓')+'</span></div>'+
      '<div class="sub" style="color:var(--muted);font-size:13px">Tổng: '+fmtMoney(i.total)+' · Đã thanh toán: '+fmtMoney(invPaid(i))+(i.note?' · '+esc(i.note):'')+'</div>'+
      (i.image?'<img class="preview" src="'+i.image+'" style="max-width:100%;border-radius:10px;margin-top:6px">':'')+
      (i.payments&&i.payments.length?'<div style="margin-top:6px">'+payHistoryHtml(i)+'</div>':'')+
      '<div class="actions">'+(rem>0?'<button class="btn btn-small btn-primary" data-invpay="'+i.id+'">Thanh toán</button>':'')+
      '<button class="btn btn-small btn-danger" data-invdel="'+i.id+'">Xoá hoá đơn</button></div></div>';}).join('')
      :'<div class="empty">Chưa có hoá đơn nào của nhà cung cấp này.</div>'));
  document.getElementById('btnEditS').onclick=()=>supplierForm(s);
  document.getElementById('btnInv').onclick=()=>invoiceForm(s);
  modalBox.querySelectorAll('[data-invpay]').forEach(b=>b.onclick=()=>payInvoiceForm(DB.invoices.find(i=>i.id===b.dataset.invpay),()=>openSupplier(id)));
  modalBox.querySelectorAll('[data-invdel]').forEach(b=>b.onclick=()=>{if(confirm('Xoá hoá đơn này? Các khoản chi tự động kèm theo cũng bị xoá.')){
    const inv=DB.invoices.find(x=>x.id===b.dataset.invdel);
    (inv.payments||[]).forEach(p=>{DB.cash=DB.cash.filter(x=>!(x.source==='supplierPayment'&&x.sourceRef===p.id));});
    armUndo();DB.invoices=DB.invoices.filter(x=>x.id!==inv.id);save();openSupplier(id);renderAll();toastUndo('Đã xoá hoá đơn.');}});
}
function invoiceForm(s){
  openModal('<h2>Thêm hoá đơn — '+esc(s.name)+'</h2><form id="fInv">'+
    field('Ngày nhập','<input id="iDate" type="date" value="'+todayISO()+'">')+
    field('Ảnh hoá đơn','<input id="iImg" type="file" accept="image/*">')+
    field('Tổng tiền hoá đơn *','<input id="iTotal" class="mn" inputmode="numeric" required>')+
    field('Ghi chú','<input id="iNote" placeholder="VD: 10 thùng nước ngọt, 5 bao gạo">')+
    '<div class="actions"><button class="btn btn-primary" type="submit">Lưu hoá đơn</button></div></form>');
  let imgData='';
  document.getElementById('iImg').addEventListener('change',e=>fileToDataURL(e.target,(d)=>{imgData=d||'';}));
  document.getElementById('fInv').onsubmit=e=>{e.preventDefault();
    DB.invoices.push({id:uid(),supplierId:s.id,date:document.getElementById('iDate').value,
      total:num(document.getElementById('iTotal').value),image:imgData,
      note:document.getElementById('iNote').value.trim(),payments:[]});
    save();renderAll();toast('Đã lưu hoá đơn.');openSupplier(s.id);};
}
function payInvoiceForm(inv,back){
  if(!inv)return;
  openModal('<h2>Thanh toán nhà cung cấp</h2>'+
    '<div class="kv"><span>Hoá đơn</span><b>Ngày '+fmtDate(inv.date)+' · '+esc((supplier(inv.supplierId)||{}).name||'')+'</b></div>'+
    '<div class="kv"><span>Còn nợ</span><b class="money red">'+fmtMoney(invRemain(inv))+'</b></div><form id="fPayI">'+
    field('Ngày thanh toán','<input id="piDate" type="date" value="'+todayISO()+'">')+
    field('Số tiền thanh toán *','<input id="piAmt" class="mn" inputmode="numeric" required value="'+invRemain(inv)+'">')+
    field('Phương thức','<select id="piMethod"><option>Tiền mặt</option><option>Chuyển khoản</option><option>Khác</option></select>')+
    field('Người thực hiện (ai trả tiền)','<input id="piPerson" placeholder="VD: Chủ cửa hàng, Thu ngân…">')+
    '<p style="color:var(--muted);font-size:13px">Khoản chi tương ứng sẽ tự được ghi vào mục Thu chi (không ghi trùng).</p>'+
    '<div class="actions"><button class="btn btn-primary" type="submit">Lưu thanh toán</button></div></form>');
  document.getElementById('fPayI').onsubmit=e=>{e.preventDefault();
    const amt=num(document.getElementById('piAmt').value);if(amt<=0)return;
    const pay={id:uid(),date:document.getElementById('piDate').value,amount:amt,method:document.getElementById('piMethod').value,person:document.getElementById('piPerson').value.trim()};
    inv.payments.push(pay);
    if(!DB.cash.some(x=>x.source==='supplierPayment'&&x.sourceRef===pay.id)){
      DB.cash.push({id:uid(),datetime:pay.date+'T'+nowLocal().slice(11),kind:'chi',type:'Thanh toán nhà cung cấp',amount:amt,
        content:'Thanh toán hoá đơn '+fmtDate(inv.date)+' — '+((supplier(inv.supplierId)||{}).name||''),person:pay.person,evidence:'',note:'',
        source:'supplierPayment',sourceRef:pay.id});
    }
    save();renderAll();toast('Đã thanh toán + tự ghi khoản chi.');if(back)back();};
}

/* ---------- THU CHI ---------- */
const THU_TYPES=['Khách trả nợ','Thu tiền khác','Khoản thu bổ sung'];
const CHI_TYPES=['Thanh toán nhà cung cấp','Chi phí điện nước','Chi phí vận chuyển','Chi phí cửa hàng','Khoản chi khác'];
function renderCash(){
  const t=todayISO();
  const sum=(kind,pred)=>DB.cash.filter(c=>c.kind===kind&&pred(c)).reduce((s,c)=>s+(Number(c.amount)||0),0);
  /* v2.5.4: thêm LÃI/LỖ = Thu − Chi (tháng này + tổng thể) — trước đây chỉ có
     thu/chi rời, không thấy lời lãi bao nhiêu (Cruz yêu cầu 2026-11-10). */
  const mThu=sum('thu',c=>String(c.datetime).startsWith(t.slice(0,7))),mChi=sum('chi',c=>String(c.datetime).startsWith(t.slice(0,7))),mNet=mThu-mChi;
  const aThu=sum('thu',()=>true),aChi=sum('chi',()=>true),aNet=aThu-aChi;
  const netCard=(label,net)=>statCard('i-coins',net>=0?'green':'chi',label+(net>=0?'':' (lỗ)'),fmtMoney(Math.abs(net)),net>=0?'green':'red');
  document.getElementById('cashCards').innerHTML=
    statCard('i-in','green','Thu tháng này',fmtMoney(mThu),'green')+
    statCard('i-out','','Chi tháng này',fmtMoney(mChi))+
    netCard('Lãi tháng này',mNet)+
    statCard('i-in','green','Tổng thu (tất cả)',fmtMoney(aThu),'green')+
    statCard('i-out','','Tổng chi (tất cả)',fmtMoney(aChi))+
    netCard('Tổng lãi (tất cả)',aNet);
  const f=document.getElementById('cashFilter').value,from=document.getElementById('cashFrom').value,to=document.getElementById('cashTo').value;
  const list=DB.cash.filter(c=>(!f||c.kind===f)&&(!from||String(c.datetime).slice(0,10)>=from)&&(!to||String(c.datetime).slice(0,10)<=to))
    .slice().sort((a,b)=>String(b.datetime).localeCompare(String(a.datetime)));
  const csEl=document.getElementById('cashSum');
  if(csEl){const fThu=list.filter(c=>c.kind==='thu').reduce((s,c)=>s+(Number(c.amount)||0),0),fChi=list.filter(c=>c.kind==='chi').reduce((s,c)=>s+(Number(c.amount)||0),0),fNet=fThu-fChi;
    csEl.innerHTML=list.length?('Khoảng đang xem: <b>'+list.length+' giao dịch</b> · Thu <b class="money green">'+fmtMoney(fThu)+'</b> · Chi <b class="money red">'+fmtMoney(fChi)+'</b> · '+(fNet>=0?'Lãi <b class="money green">':'Lỗ <b class="money red">')+fmtMoney(Math.abs(fNet))+'</b>'):'';}
  document.getElementById('cashList').innerHTML=list.length?list.map(c=>
    '<div class="row no-click"><span class="dot-ico '+(c.kind==='thu'?'':'chi')+'" style="width:40px;height:40px;border-radius:11px">'+ic(c.kind==='thu'?'i-in':'i-out')+'</span>'+(c.evidence&&String(c.evidence).startsWith('data:image')?'<img class="thumb" src="'+c.evidence+'" style="width:44px;height:44px" alt="Ảnh chứng từ">':'')+'<div class="grow"><div class="title">'+esc(c.type)+'</div>'+
    '<div class="sub">'+fmtDT(c.datetime)+(c.content?' · '+esc(c.content):'')+(c.person?' · '+esc(c.person):'')+'</div>'+
    (c.source!=='manual'?'<span class="badge">Tự động từ '+(c.source==='debtPayment'?'công nợ khách':'thanh toán NCC')+' — không sửa tại đây</span>':'')+
    (c.note?'<div class="sub">'+esc(c.note)+'</div>':'')+'</div>'+
    '<span class="money '+(c.kind==='thu'?'green':'red')+'">'+(c.kind==='thu'?'+':'−')+fmtMoney(c.amount)+'</span>'+
    (c.source==='manual'?'<button class="btn btn-small btn-danger" data-cashdel="'+c.id+'">Xoá</button>':'')+'</div>').join('')
    :'<div class="empty">Chưa có giao dịch thu chi nào trong khoảng này.</div>';
}
['cashFilter','cashFrom','cashTo'].forEach(id=>document.getElementById(id).addEventListener('change',renderCash));
document.getElementById('cashList').addEventListener('click',e=>{const b=e.target.closest('[data-cashdel]');
  if(b&&confirm('Xoá giao dịch này?')){armUndo();DB.cash=DB.cash.filter(c=>c.id!==b.dataset.cashdel);save();renderAll();toastUndo('Đã xoá giao dịch.');}});
document.getElementById('btnAddCash').onclick=()=>{
  openModal('<h2>Thêm khoản thu / chi</h2><form id="fCash">'+
    field('Loại','<select id="cashKind"><option value="thu">Thu tiền</option><option value="chi">Chi tiền</option></select>')+
    field('Phân loại','<select id="cashType"></select>')+
    field('Ngày giờ','<input id="cashWhen" type="datetime-local" value="'+nowLocal()+'">')+
    field('Số tiền *','<input id="cashAmt" class="mn" inputmode="numeric" required>')+
    field('Nội dung','<input id="cashContent" placeholder="VD: Tiền điện tháng 11">')+
    field('Người thực hiện','<input id="cashPerson">')+
    field('Ảnh chứng từ','<input id="cashEv" type="file" accept="image/*">')+
    field('Ghi chú','<textarea id="cashNote" rows="2"></textarea>')+
    '<p style="color:var(--muted);font-size:13px">Lưu ý: tiền khách trả nợ và tiền trả nhà cung cấp được app tự ghi từ mục Công nợ / Nhà cung cấp — không cần nhập tay ở đây để tránh trùng.</p>'+
    '<div class="actions"><button class="btn btn-primary" type="submit">Lưu giao dịch</button></div></form>');
  const kindSel=document.getElementById('cashKind'),typeSel=document.getElementById('cashType');
  const fillTypes=()=>{const arr=kindSel.value==='thu'?THU_TYPES:CHI_TYPES;
    typeSel.innerHTML=arr.filter(x=>x!=='Khách trả nợ'&&x!=='Thanh toán nhà cung cấp').map(x=>'<option>'+x+'</option>').join('');};
  kindSel.onchange=fillTypes;fillTypes();
  let evData='';
  document.getElementById('cashEv').addEventListener('change',e=>fileToDataURL(e.target,(d)=>{evData=d||'';}));
  document.getElementById('fCash').onsubmit=e=>{e.preventDefault();
    DB.cash.push({id:uid(),datetime:document.getElementById('cashWhen').value,kind:kindSel.value,type:typeSel.value,
      amount:num(document.getElementById('cashAmt').value),content:document.getElementById('cashContent').value.trim(),
      person:document.getElementById('cashPerson').value.trim(),evidence:evData,
      note:document.getElementById('cashNote').value.trim(),source:'manual',sourceRef:''});
    save();closeModal();renderAll();toast('Đã lưu giao dịch.');};
};

/* ---------- SAO LƯU / KHÔI PHỤC ---------- */
document.getElementById('btnExport').onclick=()=>{
  const blob=new Blob([JSON.stringify(DB,null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='quanlycuahang-saoluu-'+todayISO()+'.json';a.click();URL.revokeObjectURL(a.href);localStorage.setItem('qlch_backup_at',String(Date.now()));renderDashboard();toast('Đã tải file sao lưu.');};
document.getElementById('fileImport').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);
    if(!d||!Array.isArray(d.products))throw 0;
    requirePin('Khôi phục dữ liệu',()=>{if(confirm('Khôi phục sẽ THAY TOÀN BỘ dữ liệu hiện tại bằng file này. Tiếp tục?')){DB=normalizeDB(d);save();renderAll();toast('Đã khôi phục dữ liệu.');}});
  }catch(err){toast('File không hợp lệ.');}};r.readAsText(f);e.target.value='';});

/* ---------- XOÁ TOÀN BỘ DỮ LIỆU ---------- */
function wipeAllData(){
  if(!DB.products.length&&!DB.customers.length&&!DB.suppliers.length&&!DB.debts.length&&!DB.invoices.length&&!DB.cash.length){toast('Chưa có dữ liệu nào để xoá.');return;}
  requirePin('Xoá toàn bộ dữ liệu',()=>{
    if(!confirm('XOÁ TOÀN BỘ dữ liệu (sản phẩm, khách hàng, công nợ, hoá đơn NCC, thu chi)?\n\nApp sẽ tự tải xuống 1 bản sao lưu trước khi xoá — cần thì khôi phục lại được. Sau khi xoá, app trống như mới cài (giữ sẵn 5 thôn mặc định) và không hỏi nạp dữ liệu mẫu nữa.'))return;
    document.getElementById('btnExport').click();
    setTimeout(()=>{DB=defaults();localStorage.setItem('qlch_started','1');save();closeModal();renderAll();toast('Đã xoá sạch toàn bộ dữ liệu.');},400);});
}
document.querySelectorAll('.js-wipe').forEach(b=>b.onclick=wipeAllData);

/* ---------- MÃ PIN / KHOÁ APP ---------- */
const PIN_KEY='qlch_pin';
const pinRec=()=>{try{return JSON.parse(localStorage.getItem(PIN_KEY)||'null');}catch(e){return null;}};
const hasPin=()=>!!pinRec();
async function hashPin(pin,salt){const txt=salt+'|'+pin;
  if(window.crypto&&crypto.subtle&&window.TextEncoder){try{const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(txt));return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');}catch(e){}}
  let h1=0xdeadbeef,h2=0x41c6ce57;for(let i=0;i<txt.length;i++){const ch=txt.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);}
  return (h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');}
async function setPin(pin){const salt=uid()+Date.now().toString(36);localStorage.setItem(PIN_KEY,JSON.stringify({salt:salt,hash:await hashPin(pin,salt)}));}
async function verifyPin(pin){const r=pinRec();if(!r)return false;return (await hashPin(pin,r.salt))===r.hash;}
function updatePinState(){const el=document.getElementById('pinState');if(el)el.textContent=hasPin()?'🔐 Đã bật mã PIN':'🔓 Chưa đặt mã PIN';}
/* ---------- CỔNG ĐĂNG NHẬP (v2.2 — thay màn hình PIN khi mở app) ----------
   Mở app: chưa đăng nhập thì hiện cổng đăng nhập toàn màn hình; đã ghi nhớ
   phiên thì Firebase trả user ngay và cổng tự ẩn. PIN từ v2.2 chỉ còn dùng
   để xác nhận khi xoá toàn bộ / khôi phục dữ liệu (requirePin). */
function gateEl(id){return document.getElementById(id);}
function showGate(){const g=gateEl('loginGate');if(g)g.classList.remove('hidden');}
function hideGate(){const g=gateEl('loginGate');if(g)g.classList.add('hidden');}
function gateStatus(t){const s=gateEl('gateStatus');if(s)s.textContent=t||'';}
function gateErrShow(m){const e=gateEl('gateErr');if(e)e.textContent=m||'';}
function gateReady(){showGate();_gateArmed=true;
  ['gateGoogle','gateEmail','gatePass','gateLogin','gateReg'].forEach(id=>{const el=gateEl(id);if(el)el.disabled=false;});
  gateStatus('');if(_gateErr){gateErrShow(_gateErr);_gateErr='';}}
function gateFatal(msg){showGate();gateStatus(msg);const r=gateEl('gateReload');if(r)r.classList.remove('hidden');}
function gatePendingErr(msg){if(_gateArmed||(_authResolved&&!_sync.uid))gateErrShow(msg);else _gateErr=msg;}
(function(){
  const ua=navigator.userAgent||'';
  if(/Zalo|FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\//i.test(ua)){const w=gateEl('gateWebview');if(w)w.classList.remove('hidden');}
  const rl=gateEl('gateReload');if(rl)rl.onclick=()=>location.reload();
  const gg=gateEl('gateGoogle');if(gg)gg.onclick=()=>{gateErrShow('');googleSignIn(m=>gateErrShow(m));};
  const gf=gateEl('gateForm');if(gf)gf.addEventListener('submit',async e=>{e.preventDefault();
    const email=gateEl('gateEmail').value.trim(),pass=gateEl('gatePass').value;
    if(!email||!pass)return gateErrShow('Hãy nhập email và mật khẩu.');
    try{await firebase.auth().signInWithEmailAndPassword(email,pass);toast('Đã đăng nhập — đang nối dữ liệu cửa hàng…');}
    catch(e2){gateErrShow(AUTH_ERR[e2.code]||('Không đăng nhập được: '+e2.message));}});
  const gr=gateEl('gateReg');if(gr)gr.onclick=async()=>{
    const email=gateEl('gateEmail').value.trim(),pass=gateEl('gatePass').value;
    if(!email||!pass)return gateErrShow('Hãy nhập email và mật khẩu để tạo tài khoản.');
    try{await firebase.auth().createUserWithEmailAndPassword(email,pass);toast('Đã tạo tài khoản — đang nối dữ liệu cửa hàng…');}
    catch(e2){gateErrShow(AUTH_ERR[e2.code]||('Không đăng ký được: '+e2.message));}};
})();
function requirePin(title,cb){
  if(!hasPin()){cb();return;}
  openModal('<h3>🔐 '+esc(title)+'</h3><form id="fPin">'+
    '<div class="field"><label>Nhập mã PIN để xác nhận</label><input id="pinCheck" type="password" inputmode="numeric" autocomplete="off" maxlength="8" required></div>'+
    '<div class="pin-err" id="pinErr"></div>'+
    '<div class="actions"><button type="button" class="btn" id="pinCancel">Huỷ</button><button type="submit" class="btn btn-primary">Xác nhận</button></div></form>');
  document.getElementById('pinCancel').onclick=closeModal;
  setTimeout(()=>{const i=document.getElementById('pinCheck');if(i)i.focus();},70);
  document.getElementById('fPin').onsubmit=async ev=>{ev.preventDefault();
    if(await verifyPin(document.getElementById('pinCheck').value.trim())){closeModal();cb();}
    else{document.getElementById('pinErr').textContent='Sai mã PIN.';document.getElementById('pinCheck').value='';}};
}
function pinSetForm(title){
  openModal('<h3>🔐 '+esc(title)+'</h3><form id="fPinSet">'+
    '<div class="field"><label>Mã PIN mới (6 chữ số)</label><input id="pinNew" type="password" inputmode="numeric" autocomplete="off" maxlength="6" required></div>'+
    '<div class="field"><label>Nhập lại mã PIN</label><input id="pinNew2" type="password" inputmode="numeric" autocomplete="off" maxlength="6" required></div>'+
    '<div class="pin-err" id="pinSetErr"></div>'+
    '<p class="sub">PIN chỉ lưu trên thiết bị này, dùng để xác nhận khi XOÁ TOÀN BỘ dữ liệu hoặc KHÔI PHỤC dữ liệu. Quên PIN thì không xoá / khôi phục được — hãy nhớ kỹ. (Mở app nay dùng màn hình đăng nhập tài khoản.)</p>'+
    '<div class="actions"><button type="button" class="btn" id="pinSetCancel">Huỷ</button><button type="submit" class="btn btn-primary">Lưu mã PIN</button></div></form>');
  document.getElementById('pinSetCancel').onclick=closeModal;
  setTimeout(()=>{const i=document.getElementById('pinNew');if(i)i.focus();},70);
  document.getElementById('fPinSet').onsubmit=async ev=>{ev.preventDefault();
    const a=document.getElementById('pinNew').value.trim(),b=document.getElementById('pinNew2').value.trim(),err=document.getElementById('pinSetErr');
    if(!/^\d{6}$/.test(a)){err.textContent='PIN phải gồm đúng 6 chữ số.';return;}
    if(a!==b){err.textContent='Hai lần nhập chưa khớp.';return;}
    await setPin(a);closeModal();updatePinState();toast('Đã đặt mã PIN bảo vệ.');};
}
function pinSettings(){
  if(!hasPin()){pinSetForm('Đặt mã PIN bảo vệ');return;}
  openModal('<h3>🔐 Mã PIN bảo vệ</h3>'+
    '<div class="actions" style="flex-direction:column;align-items:stretch">'+
    '<button class="btn" id="pinChange">Đổi mã PIN</button>'+
    '<button class="btn" id="pinOff" style="color:var(--danger)">Tắt mã PIN</button></div>'+
    '<p class="sub">Mã PIN dùng để xác nhận khi XOÁ TOÀN BỘ dữ liệu và KHÔI PHỤC dữ liệu. Mở app nay dùng màn hình đăng nhập tài khoản — muốn khoá app thì bấm Đăng xuất trong mục Tài khoản & đồng bộ.</p>');
  document.getElementById('pinChange').onclick=()=>requirePin('Đổi mã PIN',()=>pinSetForm('Đổi mã PIN'));
  document.getElementById('pinOff').onclick=()=>requirePin('Tắt mã PIN',()=>{localStorage.removeItem(PIN_KEY);closeModal();updatePinState();toast('Đã tắt mã PIN.');});
}
document.querySelectorAll('.js-pin').forEach(b=>b.onclick=pinSettings);

/* ---------- render chung & dữ liệu mẫu ---------- */
function renderAll(){renderDashboard();renderProducts();renderDebts();renderSuppliers();renderCash();}
window.__qlch={get DB(){return DB;},renderAll,buildXlsxBlob,buildSheets,exportExcel};
renderAll();
updatePinState();
if(!localStorage.getItem('qlch_started'))localStorage.setItem('qlch_started','1');
/* ---------- sidebar (desktop) ---------- */
document.getElementById('sideNav').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)switchTab(b.dataset.tab);});
document.getElementById('btnThemeSide').onclick=()=>document.getElementById('btnTheme').click();
document.querySelector('.side-foot .js-export').onclick=()=>document.getElementById('btnExport').click();
document.querySelector('.side-foot .js-import').addEventListener('change',e=>{
  const si=e.target;if(!si.files||!si.files[0])return;
  const dt=new DataTransfer();dt.items.add(si.files[0]);
  const fi=document.getElementById('fileImport');fi.files=dt.files;fi.dispatchEvent(new Event('change'));si.value='';});

/* ---------- XUẤT EXCEL (.xlsx thật, không cần thư viện ngoài) ---------- */
const xe=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const colL=n=>{let s='';n++;while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;};
function xCell(r,c,v){
  if(v&&typeof v==='object'){const st=v.s||0;
    if(typeof v.v==='number')return '<c r="'+colL(c)+r+'" s="'+st+'"><v>'+v.v+'</v></c>';
    return '<c r="'+colL(c)+r+'" s="'+st+'" t="inlineStr"><is><t xml:space="preserve">'+xe(v.v??'')+'</t></is></c>';}
  if(typeof v==='number')return '<c r="'+colL(c)+r+'"><v>'+v+'</v></c>';
  return '<c r="'+colL(c)+r+'" t="inlineStr"><is><t xml:space="preserve">'+xe(v??'')+'</t></is></c>';
}
function xSheet(o){
  const nCol=o.headers.length,last=colL(nCol-1);
  let rows='';
  rows+='<row r="1" ht="24" customHeight="1">'+xCell(1,0,{v:o.title,s:1})+'</row>';
  rows+='<row r="2">'+xCell(2,0,{v:o.subtitle,s:2})+'</row>';
  rows+='<row r="3"></row>';
  rows+='<row r="4">'+o.headers.map((h,i)=>xCell(4,i,{v:h,s:3})).join('')+'</row>';
  o.rows.forEach((r,ri)=>{const rn=ri+5;
    rows+='<row r="'+rn+'">'+r.map((v,ci)=>{
      if(v&&typeof v==='object')return xCell(rn,ci,v);
      if(typeof v==='number'&&(o.moneyCols||[]).includes(ci))return xCell(rn,ci,{v,s:4});
      return xCell(rn,ci,v);}).join('')+'</row>';});
  (o.footer||[]).forEach((r,fi)=>{const rn=o.rows.length+5+fi;
    rows+='<row r="'+rn+'">'+r.map((v,ci)=>xCell(rn,ci,(v&&typeof v==='object')?v:{v,s:5})).join('')+'</row>';});
  const merges='<mergeCells count="2"><mergeCell ref="A1:'+last+'1"/><mergeCell ref="A2:'+last+'2"/></mergeCells>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
  '<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection activeCell="A5" sqref="A5"/></sheetView></sheetViews>'+
  '<cols>'+o.widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols>'+
  '<sheetData>'+rows+'</sheetData>'+merges+'</worksheet>';
}
function buildSheets(){
  const now=new Date();
  const subtitle='Xuất lúc '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')+' ngày '+fmtDate(todayISO())+' · Phần mềm Quản Lý Cửa Hàng';
  const t=todayISO(),month=t.slice(0,7);
  const sumCash=(k,p)=>DB.cash.filter(c=>c.kind===k&&String(c.datetime).startsWith(p)).reduce((s,c)=>s+(Number(c.amount)||0),0);
  const totalDebt=DB.debts.reduce((s,d)=>s+debtRemain(d),0),totalSup=DB.invoices.reduce((s,i)=>s+invRemain(i),0);
  const alerts=allAlerts(),nAlerts=alerts.expired.length+alerts.out.length+alerts.expiring.length+alerts.low.length;
  const M=v=>({v,s:4}),B=v=>({v,s:7});
  const sheets=[];
  const ovRows=[
    ['Tổng số sản phẩm đang kinh doanh',DB.products.filter(p=>p.status==='active').length],
    ['Tổng số lượng tồn kho',DB.products.reduce((s,p)=>s+stockOf(p),0)],
    ['Số khách đang còn nợ',new Set(DB.debts.filter(d=>debtRemain(d)>0).map(d=>d.customerId)).size],
    ['Tổng tiền khách còn nợ',{v:totalDebt,s:4}],
    ['Tổng tiền còn nợ nhà cung cấp',{v:totalSup,s:4}],
    ['Thu hôm nay',{v:sumCash('thu',t),s:4}],['Chi hôm nay',{v:sumCash('chi',t),s:4}],
    ['Thu tháng này',{v:sumCash('thu',month),s:4}],['Chi tháng này',{v:sumCash('chi',month),s:4}],
    ['Số cảnh báo tồn kho / hạn dùng',nAlerts]];
  [['expired','ĐÃ HẾT HẠN'],['out','HẾT HÀNG'],['expiring','SẮP HẾT HẠN'],['low','SẮP HẾT TỒN']].forEach(([k,lb])=>{
    alerts[k].forEach(({p,al})=>ovRows.push([lb+' — '+p.name,al.label]));});
  sheets.push({name:'Tổng quan',title:'BÁO CÁO TỔNG QUAN CỬA HÀNG',subtitle,headers:['Hạng mục','Giá trị'],widths:[52,42],rows:ovRows});
  sheets.push({name:'Sản phẩm',title:'DANH SÁCH SẢN PHẨM',subtitle,
    headers:['STT','Tên sản phẩm','Mã sản phẩm','Barcode','Nhóm hàng','Đơn vị','Giá bán (đ)','Tồn kho','Ngưỡng cảnh báo','Số ngày cảnh báo hạn','Trạng thái'],
    widths:[6,34,13,18,16,10,15,10,14,16,16],moneyCols:[6],
    rows:DB.products.map((p,i)=>[i+1,p.name,p.code||'',p.barcode||'',p.group||'',p.unit||'',Number(p.sellPrice)||0,stockOf(p),Number(p.threshold)||0,Number(p.warnDays)||0,p.status==='active'?'Đang kinh doanh':'Ngừng kinh doanh']),
    footer:[[{v:'TỔNG TỒN KHO',s:5},'','','','','','',{v:DB.products.reduce((s,p)=>s+stockOf(p),0),s:6},'','','']]});
  const lotRows=[];
  DB.products.forEach(p=>{(p.lots||[]).forEach(l=>{const du=l.expiry?daysUntil(l.expiry):null;
    lotRows.push([lotRows.length+1,p.name,p.code||'',fmtDate(l.date),Number(l.qty)||0,Number(l.importPrice)||0,l.expiry?fmtDate(l.expiry):'Không có hạn',
      du===null?'—':du<0?'Đã hết hạn':du<=(Number(p.warnDays)||30)?'Sắp hết hạn':'Còn hạn']);});});
  sheets.push({name:'Lô hàng',title:'CÁC LÔ HÀNG VÀ HẠN SỬ DỤNG',subtitle,
    headers:['STT','Sản phẩm','Mã SP','Ngày nhập','Số lượng','Giá nhập (đ)','Hạn sử dụng','Tình trạng hạn'],
    widths:[6,34,12,13,11,15,14,15],moneyCols:[5],rows:lotRows});
  const debtRows=DB.debts.slice().sort((a,b)=>String(a.datetime).localeCompare(String(b.datetime))).map((d,i)=>{const c=customer(d.customerId)||{};
    return [i+1,c.name||'',(village(c.villageId)||{}).name||'',c.phone||'',fmtDT(d.datetime),d.note||'',Number(d.total)||0,debtPaid(d),debtRemain(d),debtRemain(d)>0?'Chưa trả hết':'Đã trả hết'];});
  sheets.push({name:'Công nợ khách hàng',title:'CÔNG NỢ KHÁCH HÀNG',subtitle,
    headers:['STT','Khách hàng','Thôn','Số điện thoại','Ngày giờ phát sinh','Ghi chú nợ','Tổng tiền nợ (đ)','Đã trả (đ)','Còn lại (đ)','Trạng thái'],
    widths:[6,24,12,15,17,34,16,14,14,14],moneyCols:[6,7,8],rows:debtRows,
    footer:[[{v:'TỔNG CỘNG',s:5},'','','','','',{v:DB.debts.reduce((s,d)=>s+(Number(d.total)||0),0),s:6},{v:DB.debts.reduce((s,d)=>s+debtPaid(d),0),s:6},{v:totalDebt,s:6},'']]});
  const payRows=[];
  DB.debts.forEach(d=>{let run=0;const c=customer(d.customerId)||{};
    (d.payments||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).forEach(pay=>{run+=Number(pay.amount)||0;
      payRows.push([payRows.length+1,c.name||'',fmtDT(d.datetime),fmtDate(pay.date),Number(pay.amount)||0,pay.method||'',pay.person||'',(Number(d.total)||0)-run]);});});
  sheets.push({name:'Lịch sử trả nợ',title:'LỊCH SỬ KHÁCH TRẢ NỢ',subtitle,
    headers:['STT','Khách hàng','Thuộc khoản nợ ngày','Ngày trả','Số tiền trả (đ)','Phương thức','Người thực hiện','Còn lại sau trả (đ)'],
    widths:[6,24,19,13,16,15,16,18],moneyCols:[4,7],rows:payRows,
    footer:[[{v:'TỔNG ĐÃ THU HỒI',s:5},'','',{v:payRows.reduce((s,r)=>s+(Number(r[4])||0),0),s:6},'','','']]});
  sheets.push({name:'Khách hàng',title:'DANH SÁCH KHÁCH HÀNG THEO THÔN',subtitle,
    headers:['STT','Họ tên','Thôn','Số điện thoại','Địa chỉ / ghi chú nhận diện','Tổng còn nợ (đ)'],
    widths:[6,26,13,15,38,17],moneyCols:[5],
    rows:DB.customers.map((c,i)=>[i+1,c.name,(village(c.villageId)||{}).name||'',c.phone||'',c.note||'',customerDebtTotal(c.id)]),
    footer:[[{v:'TỔNG NỢ TOÀN CỬA HÀNG',s:5},'','','','',{v:totalDebt,s:6}]]});
  const invRows=DB.invoices.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map((inv,i)=>{const s=supplier(inv.supplierId)||{};
    return [i+1,s.name||'',s.phone||'',fmtDate(inv.date),Number(inv.total)||0,invPaid(inv),invRemain(inv),inv.note||''];});
  sheets.push({name:'Hoá đơn NCC',title:'HOÁ ĐƠN NHÀ CUNG CẤP',subtitle,
    headers:['STT','Nhà cung cấp','Số điện thoại','Ngày nhập','Tổng tiền (đ)','Đã thanh toán (đ)','Còn nợ (đ)','Ghi chú'],
    widths:[6,26,15,13,15,17,14,32],moneyCols:[4,5,6],rows:invRows,
    footer:[[{v:'TỔNG CỘNG',s:5},'','',{v:DB.invoices.reduce((s,i)=>s+(Number(i.total)||0),0),s:6},{v:DB.invoices.reduce((s,i)=>s+invPaid(i),0),s:6},{v:totalSup,s:6},'']]});
  const supPayRows=[];
  DB.invoices.forEach(inv=>{let run=0;const s=supplier(inv.supplierId)||{};
    (inv.payments||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))).forEach(pay=>{run+=Number(pay.amount)||0;
      supPayRows.push([supPayRows.length+1,s.name||'',fmtDate(inv.date),fmtDate(pay.date),Number(pay.amount)||0,pay.method||'',pay.person||'',(Number(inv.total)||0)-run]);});});
  sheets.push({name:'Thanh toán NCC',title:'LỊCH SỬ THANH TOÁN NHÀ CUNG CẤP',subtitle,
    headers:['STT','Nhà cung cấp','Hoá đơn ngày','Ngày thanh toán','Số tiền (đ)','Phương thức','Người thực hiện','Còn lại sau trả (đ)'],
    widths:[6,26,14,15,15,15,16,18],moneyCols:[4,7],rows:supPayRows,
    footer:[[{v:'TỔNG ĐÃ THANH TOÁN',s:5},'','',{v:supPayRows.reduce((s,r)=>s+(Number(r[4])||0),0),s:6},'','','']]});
  const srcName=c=>c.source==='debtPayment'?'Tự động (khách trả nợ)':c.source==='supplierPayment'?'Tự động (trả NCC)':'Nhập tay';
  sheets.push({name:'Thu chi',title:'SỔ THU CHI',subtitle,
    headers:['STT','Ngày giờ','Loại','Phân loại','Số tiền (đ)','Nội dung','Người thực hiện','Ghi chú','Nguồn'],
    widths:[6,17,8,24,15,38,16,26,22],moneyCols:[4],
    rows:DB.cash.slice().sort((a,b)=>String(a.datetime).localeCompare(String(b.datetime))).map((c,i)=>[i+1,fmtDT(c.datetime),c.kind==='thu'?'Thu':'Chi',c.type,Number(c.amount)||0,c.content||'',c.person||'',c.note||'',srcName(c)]),
    footer:[[{v:'TỔNG THU',s:5},'','',{v:DB.cash.filter(c=>c.kind==='thu').reduce((s,c)=>s+(Number(c.amount)||0),0),s:6},'','','',''],
            [{v:'TỔNG CHI',s:5},'','',{v:DB.cash.filter(c=>c.kind==='chi').reduce((s,c)=>s+(Number(c.amount)||0),0),s:6},'','','','']]});
  return sheets;
}
const X_STYLES='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
'<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>'+
'<fonts count="5">'+
'<font><sz val="11"/><name val="Calibri"/></font>'+
'<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'+
'<font><b/><sz val="14"/><color rgb="FF0B7A6E"/><name val="Calibri"/></font>'+
'<font><sz val="10"/><color rgb="FF68798A"/><name val="Calibri"/></font>'+
'<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'+
'<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+
'<fill><patternFill patternType="solid"><fgColor rgb="FF0E9384"/></patternFill></fill>'+
'<fill><patternFill patternType="solid"><fgColor rgb="FFEDF1F4"/></patternFill></fill></fills>'+
'<borders count="1"><border/></borders>'+'<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'+
'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
'<cellXfs count="8">'+
'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+
'<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'+
'<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>'+
'<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'+
'<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'+
'<xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'+
'<xf numFmtId="164" fontId="4" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>'+
'<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>';
const CRC_TABLE=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=CRC_TABLE[(c^bytes[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function zipStore(files){
  const enc=new TextEncoder();const parts=[];const central=[];let offset=0;
  const dos=new Date();const time=((dos.getHours()<<11)|(dos.getMinutes()<<5)|(dos.getSeconds()>>1))&0xFFFF;
  const date=(((Math.max(1980,dos.getFullYear())-1980)<<9)|((dos.getMonth()+1)<<5)|dos.getDate())&0xFFFF;
  const u16=n=>new Uint8Array([n&255,(n>>8)&255]);const u32=n=>new Uint8Array([n&255,(n>>8)&255,(n>>16)&255,(n>>24)&255]);
  const push=a=>{parts.push(a);offset+=a.length;};
  files.forEach(f=>{
    const name=enc.encode(f.name);const data=typeof f.data==='string'?enc.encode(f.data):f.data;const crc=crc32(data);const start=offset;
    push(u32(0x04034b50));push(u16(20));push(u16(0x0800));push(u16(0));push(u16(time));push(u16(date));
    push(u32(crc));push(u32(data.length));push(u32(data.length));push(u16(name.length));push(u16(0));push(name);push(data);
    const cen=[u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(time),u16(date),u32(crc),u32(data.length),u32(data.length),
      u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(start),name];
    cen.forEach(x=>central.push(x));});
  let cenSize=0;central.forEach(x=>cenSize+=x.length);const cenStart=offset;
  central.forEach(x=>push(x));
  push(u32(0x06054b50));push(u16(0));push(u16(0));push(u16(files.length));push(u16(files.length));push(u32(cenSize));push(u32(cenStart));push(u16(0));
  return new Blob(parts,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
function buildXlsxBlob(){
  const sheets=buildSheets();
  const files=[
    {name:'[Content_Types].xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'},
    {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+xe(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'},
    {name:'xl/_rels/workbook.xml.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
    {name:'xl/styles.xml',data:X_STYLES}];
  sheets.forEach((s,i)=>files.push({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:xSheet(s)}));
  return zipStore(files);
}
function exportExcel(){
  const blob=buildXlsxBlob();
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='bao-cao-cua-hang-'+todayISO()+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  toast('Đã xuất báo cáo Excel ('+buildSheets().length+' trang).');
}
document.querySelectorAll('.js-excel').forEach(b=>b.addEventListener('click',exportExcel));

document.getElementById('qAddProduct').addEventListener('click',()=>{switchTab('products');productForm(null);});
document.getElementById('qAddCustomer').addEventListener('click',()=>{switchTab('debts');customerForm(null);});
document.getElementById('qExcel').addEventListener('click',exportExcel);

/* ---------- TÀI KHOẢN & ĐỒNG BỘ (Firebase) — v2.1 ----------
   Mô hình cửa hàng dùng chung:
   - stores/{storeId}          : {ownerUid, ownerEmail, memberEmails[]} — chủ + danh sách người quản lý.
   - stores/{storeId}/state/main : {data, updatedAt} — toàn bộ dữ liệu bán hàng.
   - users/{uid}               : {storeId} — máy/người này thuộc cửa hàng nào.
   - invites/{email}           : {stores[]} — lời mời đang chờ cho email đó.
   Đăng nhập Google hoặc email/mật khẩu. Người đầu tiên đăng nhập (chưa thuộc
   cửa hàng nào, chưa được mời) trở thành CHỦ cửa hàng; chủ mời thêm người
   bằng email — người được mời đăng nhập bằng đúng email đó sẽ vào cùng cửa hàng.
   v2.2: mở app là CỔNG ĐĂNG NHẬP (thay màn hình PIN); Google dùng redirect.
   v2.3: authDomain = cuahangtuyen.netlify.app (KHÔNG dùng firebaseapp.com):
   Chrome chặn cookie/lưu trữ bên thứ ba giữa miền app và miền firebaseapp.com
   làm đăng nhập Google quay về "chưa đăng nhập" không một lời lỗi. Netlify
   proxy /__/auth/* + /__/firebase/* về firebaseapp.com (file _redirects ở
   gốc repo) nên trang xử lý đăng nhập CÙNG miền với app khi chạy trên
   Netlify → Google đăng nhập được. Hệ quả: link chính cho khách là Netlify;
   bản GitHub Pages chỉ còn đăng nhập email/mật khẩu là chắc chắn.
   v2.4: CHUYỂN NHÀ sang VERCEL (để bỏ hẳn badge "Powered by Netlify" — gỡ
   badge trên Netlify phải trả phí; Vercel miễn phí không chèn badge, deploy
   thẳng từ GitHub nên cũng khỏi cần mật khẩu Google như Firebase CLI).
   Cruz chốt Firebase Hosting trước rồi đổi sang Vercel giữa chừng
   ("Hay deploy lên vercel") — Firebase Hosting chưa từng deploy thật.
   Chiêu cùng miền giữ nguyên như v2.3 nhưng qua file vercel.json ở gốc repo:
   rewrites proxy /__/auth/* + /__/firebase/* về firebaseapp.com và
   authDomain = cuahangtuyen.vercel.app. vercel.json cũng đặt Cache-Control
   no-cache cho mọi file nên hết cảnh app.js bị cache 10 phút như Pages.
   LINK CHÍNH từ v2.4: https://cuahangtuyen.vercel.app — Netlify/Pages thành
   dự phòng (đăng nhập email vẫn được; Google ở đó khác miền với authDomain
   nên có thể lại bị Chrome chặn).
   v2.5.0: vòng làm đẹp "tĩnh" (badge cảnh báo nhỏ nhạt, chip + nút phẳng,
   hero gọn, banner sao lưu mỏng, thẻ lẻ tràn hàng) + hạ thanh tab mobile
   sát đáy (hết badge Netlify) + sửa lệch ô Barcode trong form (nhãn 2 dòng
   vs 1 dòng) + QUÉT ĐIỀN NHANH: nút Quét ngay trong form sản phẩm, quét
   trúng mã đã có thì hỏi mở sản phẩm cũ (chặn tạo trùng cả khi lưu),
   mã mới thì thử tra tên gợi ý từ Open Food Facts (giá vẫn nhập tay).
   Hotfix sau khi Cruz quét thử: tra không thấy tên thì hiện câu giải thích
   "mã vạch chỉ là dãy số…" kẻo tưởng app hỏng (EAN-13 không chứa tên/giá/hạn).
   v2.5.2: banner sao lưu hết báo động giả — chỉ hiện khi dữ liệu thật sự
   chưa an toàn (chưa đồng bộ server ≤7 ngày VÀ chưa sao lưu file ≤7 ngày);
   lastSyncAt đọc từ qlch_sync đã lưu, không đụng biến _sync (tránh lỗi
   "truy cập trước khi khởi tạo" khi render chạy sớm/môi trường chặn SDK).
   v2.5.3 (Cruz tự test góp ý): lưu sản phẩm xong ĐÓNG popup luôn (trước tự
   mở tiếp chi tiết phải tắt thêm lần nữa) + trạng thái ngừng kinh doanh
   hiện rõ ở trang chi tiết kèm nút Ngừng/Kinh doanh lại 1 chạm (trước chỉ
   có ô chọn khuất trong form Sửa nên tưởng chưa có).
   v2.5.4 (Cruz yêu cầu khi rà soát bàn giao): mục Thu chi có LÃI/LỖ =
   Thu − Chi theo tháng này và tổng thể (thẻ riêng, lỗ thì đỏ + ghi "(lỗ)"),
   kèm dòng tổng hợp theo đúng khoảng ngày đang lọc. */
const FB_CONFIG={apiKey:"AIzaSyDFHbNzQtuOJEKKOxvww_2S6U_nhuvnICU",authDomain:"cuahangtuyen.vercel.app",projectId:"quanlycuahang-1aa8a",storageBucket:"quanlycuahang-1aa8a.firebasestorage.app",messagingSenderId:"61934531773",appId:"1:61934531773:web:bf7fbaf53d84d8188773d4"};
const SYNC_KEY='qlch_sync';
let _sync={uid:'',email:'',storeId:'',isOwner:false,ownerEmail:'',memberEmails:[],updatedAt:0,lastSyncAt:0,stateFor:''};
try{const _s=JSON.parse(localStorage.getItem(SYNC_KEY)||'null');if(_s&&typeof _s==='object')_sync=Object.assign(_sync,_s);}catch(e){}
let _fbReady=false,_pushTimer=null,_applyingRemote=false,_unsubState=null,_unsubMeta=null,_pushingVal=0;
function syncSaveMeta(){try{localStorage.setItem(SYNC_KEY,JSON.stringify(_sync));}catch(e){}}
function syncTouch(){if(_applyingRemote)return;_sync.updatedAt=Date.now();if(_sync.storeId)_sync.stateFor=_sync.storeId;syncSaveMeta();updateSyncState();schedulePush();}
function schedulePush(){if(!_fbReady||!_sync.storeId)return;clearTimeout(_pushTimer);_pushTimer=setTimeout(()=>{pushCloud(false);},1500);}
function fmtTime(ts){if(!ts)return'';const d=new Date(ts);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function updateSyncState(){
  let txt;
  if(!FB_CONFIG)txt='Dữ liệu đang lưu trên thiết bị này.';
  else if(!_sync.uid)txt='Chưa đăng nhập — dữ liệu chỉ lưu ở máy này.';
  else txt='☁️ '+_sync.email+(_sync.lastSyncAt?' — đã đồng bộ '+fmtTime(_sync.lastSyncAt):' — đang chờ đồng bộ…');
  document.querySelectorAll('.sync-state').forEach(el=>{el.textContent=txt;});
}
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}
function withTimeout(p,ms){return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))]);}
function stateRef(){return firebase.firestore().doc('stores/'+_sync.storeId+'/state/main');}
let _authResolved=false,_gateErr='',_gateArmed=false;
async function initSync(){
  updateSyncState();
  if(!FB_CONFIG){gateFatal('Bản app này chưa bật đăng nhập bằng tài khoản.');return;}
  const slowTimer=setTimeout(()=>{if(!_authResolved){gateStatus('Máy chủ đăng nhập phản hồi chậm — kiểm tra mạng, hoặc tải lại trang.');const r=document.getElementById('gateReload');if(r)r.classList.remove('hidden');}},20000);
  try{
    const base='https://www.gstatic.com/firebasejs/10.12.2/';
    gateStatus('Đang tải phần đăng nhập…');
    await withTimeout(loadScript(base+'firebase-app-compat.js'),20000);
    await withTimeout(loadScript(base+'firebase-auth-compat.js'),20000);
    await withTimeout(loadScript(base+'firebase-firestore-compat.js'),20000);
    firebase.initializeApp(FB_CONFIG);
    try{await withTimeout(firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL),6000);}catch(e){}
    _fbReady=true;
    /* Kết quả redirect Google: xử lý NỀN, tuyệt đối không await trước listener
       — getRedirectResult có thể treo vô hạn khi trình duyệt chặn iframe của
       authDomain (đã dính thật 2026-11-10: cổng kẹt ở "Đang kết nối…"). */
    firebase.auth().getRedirectResult().catch(e=>{gatePendingErr(AUTH_ERR[e.code]||('Đăng nhập Google chưa thành công — thử lại. ('+(e.code||'')+')'));});
    /* Mở khoá form cổng NGAY khi SDK sẵn sàng — không chờ onAuthStateChanged
       (listener có thể về rất chậm ở trình duyệt chặn cookie bên thứ ba;
       chờ nó từng làm cổng kẹt disabled vô hạn). Listener về sau sẽ tự
       ẩn cổng nếu đã có phiên đăng nhập. */
    if(!_sync.uid)gateReady();
    firebase.auth().onAuthStateChanged(async user=>{
      _authResolved=true;clearTimeout(slowTimer);
      if(_unsubState){_unsubState();_unsubState=null;}
      if(_unsubMeta){_unsubMeta();_unsubMeta=null;}
      if(user){try{sessionStorage.removeItem('qlch_gredir');}catch(e){}
        _sync.uid=user.uid;_sync.email=user.email||'';syncSaveMeta();updateSyncState();hideGate();await bindStore(user);}
      else{_sync.uid='';_sync.email='';_sync.storeId='';_sync.isOwner=false;_sync.ownerEmail='';_sync.memberEmails=[];syncSaveMeta();updateSyncState();
        if(!_gateErr){try{if(sessionStorage.getItem('qlch_gredir'))_gateErr='Đăng nhập Google chưa hoàn tất — có thể bạn chưa chọn xong tài khoản, hoặc trình duyệt đã chặn bước quay lại app. Hãy thử bấm lại nút Google, hoặc đăng nhập bằng email + mật khẩu bên dưới.';sessionStorage.removeItem('qlch_gredir');}catch(e){}}
        gateReady();}
    });
  }catch(e){clearTimeout(slowTimer);gateFatal('Không tải được phần đăng nhập — kiểm tra kết nối mạng rồi tải lại trang.');}
}
async function bindStore(user){
  const fs=firebase.firestore();
  try{
    let storeId='';
    const uDoc=await fs.doc('users/'+user.uid).get().catch(()=>null);
    if(uDoc&&uDoc.exists&&uDoc.data().storeId)storeId=uDoc.data().storeId;
    if(storeId){
      const sDoc=await fs.doc('stores/'+storeId).get().catch(()=>null);
      if(!sDoc||!sDoc.exists)storeId='';
      else if(!(sDoc.data().ownerUid===user.uid||(sDoc.data().memberEmails||[]).includes(_sync.email)))storeId='';
    }
    if(!storeId){
      const inv=await fs.doc('invites/'+_sync.email).get().catch(()=>null);
      const list=inv&&inv.exists?(inv.data().stores||[]):[];
      for(const sid of list){
        const sDoc=await fs.doc('stores/'+sid).get().catch(()=>null);
        if(sDoc&&sDoc.exists&&(sDoc.data().memberEmails||[]).includes(_sync.email)){storeId=sid;break;}
      }
    }
    if(!storeId){
      storeId=uid();
      await fs.doc('stores/'+storeId).set({ownerUid:user.uid,ownerEmail:_sync.email,memberEmails:[_sync.email],createdAt:Date.now()});
    }
    await fs.doc('users/'+user.uid).set({storeId:storeId,email:_sync.email},{merge:true});
    const meta=await fs.doc('stores/'+storeId).get();
    _sync.storeId=storeId;
    if(meta.exists){_sync.isOwner=meta.data().ownerUid===user.uid;_sync.ownerEmail=meta.data().ownerEmail||'';_sync.memberEmails=meta.data().memberEmails||[];}
    if(_sync.stateFor!==storeId)_sync.updatedAt=0;
    syncSaveMeta();updateSyncState();
    _unsubMeta=fs.doc('stores/'+storeId).onSnapshot(s=>{
      if(!s.exists)return;const d=s.data();
      _sync.isOwner=d.ownerUid===_sync.uid;_sync.ownerEmail=d.ownerEmail||'';_sync.memberEmails=d.memberEmails||[];
      syncSaveMeta();updateSyncState();
    },()=>{});
    await firstSyncState();
    _unsubState=stateRef().onSnapshot(snap=>{
      if(!snap.exists)return;const d=snap.data();
      if(d&&d.updatedAt>_sync.updatedAt&&d.updatedAt!==_pushingVal)applyRemote(d.data,d.updatedAt);
    },()=>{});
    updateSyncState();
  }catch(e){toast('Chưa nối được dữ liệu cửa hàng — kiểm tra mạng rồi mở lại app.');}
}
async function firstSyncState(){
  try{
    const snap=await stateRef().get();
    if(!snap.exists){await pushCloud(true);return;}
    const d=snap.data();
    if(d.updatedAt>_sync.updatedAt)applyRemote(d.data,d.updatedAt);
    else if(d.updatedAt<_sync.updatedAt)await pushCloud(true);
    else{_sync.lastSyncAt=Date.now();_sync.stateFor=_sync.storeId;syncSaveMeta();updateSyncState();}
  }catch(e){toast('Chưa đồng bộ được — kiểm tra mạng rồi thử lại.');}
}
async function pushCloud(loud){
  if(!_fbReady||!_sync.storeId)return false;
  const payload={data:JSON.parse(JSON.stringify(DB)),updatedAt:_sync.updatedAt||Date.now(),byEmail:_sync.email,v:3};
  if(JSON.stringify(payload).length>950000){toast('⚠️ Dữ liệu kèm ảnh đã quá lớn để đồng bộ tự động — hãy Sao lưu file JSON để giữ an toàn.');return false;}
  try{
    _pushingVal=payload.updatedAt;
    await stateRef().set(payload);
    _sync.lastSyncAt=Date.now();_sync.stateFor=_sync.storeId;syncSaveMeta();updateSyncState();
    return true;
  }catch(e){if(loud)toast('Đẩy dữ liệu lên server chưa được — kiểm tra mạng.');return false;}
}
function applyRemote(data,updatedAt){
  if(!data||!Array.isArray(data.products))return;
  _applyingRemote=true;
  DB=normalizeDB(data);
  try{localStorage.setItem(LS_KEY,JSON.stringify(DB));}catch(e){}
  _sync.updatedAt=updatedAt;_sync.lastSyncAt=Date.now();_sync.stateFor=_sync.storeId;syncSaveMeta();
  renderAll();updateSyncState();
  _applyingRemote=false;
  toast('Đã lấy dữ liệu mới nhất từ server.');
}
async function inviteMember(email){
  const fs=firebase.firestore();
  await fs.doc('stores/'+_sync.storeId).update({memberEmails:firebase.firestore.FieldValue.arrayUnion(email)});
  await fs.doc('invites/'+email).set({stores:firebase.firestore.FieldValue.arrayUnion(_sync.storeId)},{merge:true});
}
async function removeMember(email){
  const fs=firebase.firestore();
  await fs.doc('stores/'+_sync.storeId).update({memberEmails:firebase.firestore.FieldValue.arrayRemove(email)});
  await fs.doc('invites/'+email).set({stores:firebase.firestore.FieldValue.arrayRemove(_sync.storeId)},{merge:true});
}
const AUTH_ERR={'auth/invalid-email':'Email chưa đúng định dạng.','auth/user-not-found':'Chưa có tài khoản với email này — bấm "Đăng ký tài khoản mới".','auth/wrong-password':'Sai mật khẩu.','auth/invalid-credential':'Email hoặc mật khẩu chưa đúng.','auth/email-already-in-use':'Email này đã có tài khoản — hãy bấm "Đăng nhập".','auth/weak-password':'Mật khẩu phải từ 6 ký tự trở lên.','auth/network-request-failed':'Lỗi mạng — kiểm tra kết nối rồi thử lại.','auth/too-many-requests':'Thử sai quá nhiều lần — đợi ít phút rồi thử lại.','auth/unauthorized-domain':'Tên miền này chưa được phép đăng nhập — báo người cài đặt app.','auth/operation-not-allowed':'Cách đăng nhập này chưa được bật — báo người cài đặt app.','auth/operation-not-supported-in-this-environment':'Trình duyệt này không hỗ trợ đăng nhập Google (hay gặp khi mở app trong Zalo/Facebook). Hãy mở link app bằng Chrome hoặc Safari rồi thử lại.','auth/web-storage-unsupported':'Trình duyệt đang chặn lưu trữ — tắt chế độ riêng tư / cho phép cookie rồi thử lại.','auth/internal-error':'Máy chủ đăng nhập đang bận — thử lại sau ít phút.','auth/account-exists-with-different-credential':'Email này đã đăng ký bằng mật khẩu — hãy đăng nhập bằng email + mật khẩu.'};
/* Đăng nhập Google LUÔN dùng redirect (không dùng popup): trên Chrome điện
   thoại, popup bị chặn cookie bên thứ ba nên đăng nhập xong vẫn quay về
   "chưa đăng nhập" — redirect là cách Firebase khuyên dùng cho mobile. */
async function googleSignIn(errCb){
  try{try{sessionStorage.setItem('qlch_gredir','1');}catch(e){}
    await firebase.auth().signInWithRedirect(new firebase.auth.GoogleAuthProvider());
  }catch(e){try{sessionStorage.removeItem('qlch_gredir');}catch(e2){}
    errCb(AUTH_ERR[e.code]||('Không đăng nhập Google được: '+e.message));}
}
function accountModal(){
  if(!FB_CONFIG){openModal('<h2>Tài khoản & đồng bộ</h2><p class="acc-note">Bản app này chưa bật đồng bộ server.</p>');return;}
  if(!_fbReady){openModal('<h2>Tài khoản & đồng bộ</h2><p class="acc-note">Đang kết nối server… đợi vài giây rồi mở lại mục này. Nếu đang mất mạng, app vẫn dùng dữ liệu trên máy bình thường.</p>');return;}
  if(!_sync.uid){
    openModal('<h2>☁️ Tài khoản & đồng bộ</h2>'
    +'<p class="acc-note">Đăng nhập để các máy dùng chung một bộ dữ liệu của cửa hàng. Đăng nhập một lần — app <strong>tự ghi nhớ</strong> trên máy này, những lần sau mở app là dùng luôn. Người đầu tiên đăng nhập sẽ là <strong>chủ cửa hàng</strong> và có quyền mời thêm người quản lý.</p>'
    +'<div class="acc-actions"><button class="btn btn-primary" id="accGoogle">Đăng nhập bằng Google</button></div>'
    +'<p class="acc-err hidden" id="accErr"></p>'
    +'<p class="acc-note" style="margin-top:16px">Hoặc dùng email + mật khẩu:</p>'
    +field('Email','<input id="accEmail" type="email" autocomplete="username" placeholder="vidu@gmail.com">')
    +field('Mật khẩu','<input id="accPass" type="password" autocomplete="current-password" placeholder="Ít nhất 6 ký tự">')
    +'<div class="acc-actions"><button class="btn" id="accLogin">Đăng nhập</button><button class="btn" id="accReg">Đăng ký tài khoản mới</button></div>');
    const err=m=>{const e=document.getElementById('accErr');e.textContent=m;e.classList.remove('hidden');};
    const cred=()=>({email:document.getElementById('accEmail').value.trim(),pass:document.getElementById('accPass').value});
    document.getElementById('accGoogle').onclick=()=>{googleSignIn(err);};
    document.getElementById('accLogin').onclick=async()=>{const c=cred();if(!c.email||!c.pass)return err('Hãy nhập email và mật khẩu.');try{await firebase.auth().signInWithEmailAndPassword(c.email,c.pass);closeModal();toast('Đã đăng nhập — đang nối dữ liệu cửa hàng…');}catch(e){err(AUTH_ERR[e.code]||('Không đăng nhập được: '+e.message));}};
    document.getElementById('accReg').onclick=async()=>{const c=cred();if(!c.email||!c.pass)return err('Hãy nhập email và mật khẩu.');try{await firebase.auth().createUserWithEmailAndPassword(c.email,c.pass);closeModal();toast('Đã tạo tài khoản — đang nối dữ liệu cửa hàng…');}catch(e){err(AUTH_ERR[e.code]||('Không đăng ký được: '+e.message));}};
  }else{
    const members=(_sync.memberEmails||[]).map(em=>{
      const isOw=em===_sync.ownerEmail;
      const canDel=_sync.isOwner&&!isOw;
      return '<div class="member-row"><span>'+esc(em)+(isOw?' <em>(Chủ cửa hàng)</em>':'')+'</span>'+(canDel?'<button class="btn btn-ghost member-del" data-email="'+esc(em)+'">Gỡ</button>':'')+'</div>';
    }).join('');
    openModal('<h2>☁️ Tài khoản & đồng bộ</h2>'
    +'<p>Đang đăng nhập: <strong>'+esc(_sync.email)+'</strong> — '+(_sync.isOwner?'Chủ cửa hàng':'Người quản lý')+'</p>'
    +'<p class="acc-note">'+(_sync.lastSyncAt?('Lần đồng bộ gần nhất: '+fmtTime(_sync.lastSyncAt)+'. '):'Chưa đồng bộ lần nào. ')+'Mọi thay đổi sẽ tự động lên server sau khoảng 2 giây. Nếu hai máy cùng sửa một lúc, bản lưu sau cùng sẽ thắng.</p>'
    +'<h3 style="margin:16px 0 6px">Người quản lý cửa hàng</h3>'
    +'<div>'+members+'</div>'
    +(_sync.isOwner
      ? field('Mời thêm người quản lý (nhập email Google của họ)','<input id="invEmail" type="email" placeholder="vidu@gmail.com">')
        +'<div class="acc-actions"><button class="btn" id="accInvite">Gửi lời mời</button></div>'
        +'<p class="acc-note">Người được mời chỉ cần mở app, bấm "Đăng nhập bằng Google" bằng đúng email này là vào cùng cửa hàng.</p>'
      : '<p class="acc-note">Chỉ chủ cửa hàng mới mời thêm / gỡ người quản lý.</p>')
    +'<p class="acc-err hidden" id="accErr"></p>'
    +'<div class="acc-actions"><button class="btn" id="accPush">⬆ Đẩy lên server ngay</button><button class="btn" id="accPull">⬇ Lấy từ server về</button></div>'
    +'<div class="acc-actions"><button class="btn btn-ghost" id="accOut">Đăng xuất</button></div>'
    +'<p class="acc-note">Đăng xuất không xoá dữ liệu trên máy này — máy chỉ ngừng đồng bộ cho tới khi đăng nhập lại.</p>');
    const err=m=>{const e=document.getElementById('accErr');e.textContent=m;e.classList.remove('hidden');};
    if(_sync.isOwner){
      document.getElementById('accInvite').onclick=async()=>{
        const em=document.getElementById('invEmail').value.trim().toLowerCase();
        if(!em||!em.includes('@'))return err('Hãy nhập email hợp lệ.');
        if((_sync.memberEmails||[]).includes(em))return err('Email này đã là người quản lý rồi.');
        try{await inviteMember(em);closeModal();toast('Đã mời '+em+' — họ đăng nhập bằng email này là vào được cửa hàng.');}
        catch(e){err('Mời chưa được — kiểm tra mạng rồi thử lại.');}
      };
      document.querySelectorAll('.member-del').forEach(b=>b.onclick=async()=>{
        if(!confirm('Gỡ '+b.dataset.email+' khỏi danh sách người quản lý?'))return;
        try{await removeMember(b.dataset.email);closeModal();toast('Đã gỡ người quản lý.');}
        catch(e){err('Gỡ chưa được — kiểm tra mạng rồi thử lại.');}
      });
    }
    document.getElementById('accPush').onclick=async()=>{if(await pushCloud(true)){closeModal();toast('Đã đẩy dữ liệu lên server.');}};
    document.getElementById('accPull').onclick=()=>{if(!confirm('Lấy dữ liệu từ server về sẽ GHI ĐÈ dữ liệu đang có trên máy này. Tiếp tục?'))return;
      stateRef().get().then(snap=>{if(!snap.exists){toast('Server chưa có dữ liệu nào.');return;}const d=snap.data();applyRemote(d.data,d.updatedAt);closeModal();}).catch(()=>toast('Không lấy được dữ liệu — kiểm tra mạng.'));};
    document.getElementById('accOut').onclick=async()=>{await firebase.auth().signOut();closeModal();toast('Đã đăng xuất. Dữ liệu trên máy vẫn giữ nguyên.');};
  }
}
document.querySelectorAll('.js-account').forEach(b=>b.addEventListener('click',accountModal));
initSync();
