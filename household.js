(function () {
  'use strict';
  const $ = id=>document.getElementById(id), money=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY'}).format(n);
  const demo=new URLSearchParams(location.search).get('demo')==='1';
  let preview=null, importRequest=null, latestClaim=null, busy=false, refreshNumber=0, knownPayments=[];
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const uuid=()=>crypto.randomUUID();
  function message(id,text,error=false){$(id).textContent=text;$(id).dataset.error=String(error);}
  function node(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
  function pending(){try{return JSON.parse(sessionStorage.getItem('hh.pending')||'null');}catch(e){return null;}}
  async function api(action, fields={}) {
    if(demo){if(action==='hh_dashboard')return demoDashboard(fields.month);throw Error('操作見本では保存できません。');}
    const accessKey=sessionStorage.getItem('hh.key');
    if(!accessKey){$('hh-connection').open=true;throw Error('接続設定に家計簿の接続キーを入力してください。');}
    return HHClientCore.send(GAS_URL,{type:'web_app',action,accessKey,...fields},fetch);
  }
  function table(target,headers,rows){
    const t=node('table');t.className='hh-table';const h=node('tr');headers.forEach(v=>h.append(node('th',v)));const head=node('thead');head.append(h);t.append(head);
    const body=node('tbody');rows.forEach(r=>{const tr=node('tr');r.forEach(v=>{const td=node('td');if(v instanceof Node)td.append(v);else td.textContent=String(v);tr.append(td);});body.append(tr);});t.append(body);$(target).replaceChildren(t);
    if(!rows.length)$(target).replaceChildren(node('p','記録がありません。未入力分は集計に含まれません。'));
  }
  function bars(target,items){
    $(target).replaceChildren();const max=Math.max(1,...items.map(r=>Math.abs(r.amount)));
    items.forEach(r=>{const box=node('div',r.name+'　'+money(r.amount));box.className='hh-bar';box.dataset.negative=String(r.amount<0);const track=node('div'),bar=node('i');bar.style.width=(100*Math.abs(r.amount)/max)+'%';track.append(bar);box.append(track);$(target).append(box);});
    if(!items.length)$(target).append(node('p','この月はまだ記録がありません。'));
  }
  async function refresh(){
    const request=++refreshNumber, month=$('hh-month').value;
    message('hh-status','共同家計を読み込んでいます…');
    try{
      const data=await api('hh_dashboard',{month});if(request!==refreshNumber)return;
      const s=data.summary;$('hh-expense').textContent=money(s.expense);$('hh-income').textContent=money(s.income);$('hh-balance').textContent=money(s.balance);
      $('hh-coverage').textContent=data.coverage+' 収支差額は口座残高ではありません。';
      bars('hh-categories',s.categories);bars('hh-trends',data.trends.map(r=>({name:r.month,amount:r.expense})));
      table('hh-transactions',['日付','区分','費目','店舗・内容','金額','支払方法','元の行'],data.transactions.map(r=>[r.date,r.kind,r.category,[r.merchant,r.item].filter(Boolean).join(' / '),money(r.amount),r.card||r.method,'Data '+r.row]));
      $('hh-issues').replaceChildren(...data.issues.map(r=>node('li','Data '+r.row+'行：'+r.message)));
      if(!data.issues.length)$('hh-issues').append(node('li','除外した共同取引はありません。'));
      knownPayments=data.payments;
      const payments=data.payments.filter(r=>r.date.slice(0,7)===month).sort((a,b)=>a.date.localeCompare(b.date));
      table('hh-payments',['日付','項目','金額','状態','修正'],payments.map(p=>{const b=node('button','修正');b.type='button';b.onclick=()=>editPayment(p);return[p.date,p.name,money(p.amount),p.status,b];}));
      const total=status=>payments.filter(p=>p.status===status).reduce((s,p)=>s+p.amount,0);
      $('hh-payment-total').textContent='未払いの確定分 '+money(total('確定'))+' ／ 見込み '+money(total('見込み'))+' ／ 支払済 '+money(total('支払済'))+'。登録済みの予定のみです。';
      message('hh-status',demo?'架空データの操作見本を表示しています。':s.count+'件を集計しました。');
    }catch(e){if(request===refreshNumber){['hh-expense','hh-income','hh-balance'].forEach(id=>$(id).textContent='—');['hh-categories','hh-trends','hh-transactions','hh-payments','hh-issues'].forEach(id=>$(id).replaceChildren());$('hh-payment-total').textContent='読込未完了';$('hh-coverage').textContent='読み込めなかったため、金額を表示していません。';message('hh-status',e.message,true);}}
  }
  function formTransaction(){return {date:$('hh-date').value,kind:$('hh-kind').value,amount:$('hh-amount').value,category:$('hh-category').value,method:$('hh-method').value,card:$('hh-method').value==='クレジットカード'?$('hh-card').value:'',merchant:$('hh-merchant').value,item:$('hh-item').value,note:$('hh-note').value,payer:'共同',source:'手入力'};}
  function restoreTransaction(t){['date','kind','amount','category','method','merchant','item','note'].forEach(k=>$('hh-'+k).value=t[k]||'');if(t.card)$('hh-card').value=t.card;$('hh-card').disabled=t.method!=='クレジットカード';}
  async function save(event){
    event.preventDefault();if(busy)return;busy=true;$('hh-save').disabled=true;
    try{
      let t=pending();const current=HouseholdCore.transaction({...formTransaction(),id:t?t.id:uuid()},today());
      if(t){if(!HouseholdCore.same(t,current)){restoreTransaction(t);throw Error('前回の保存結果が未確認です。元の入力に戻しました。同じ内容で再度記録すると、登録済みか確認できます。');}}
      else {t=current;sessionStorage.setItem('hh.pending',JSON.stringify(t));}
      message('hh-save-status','保存しています…');await api('hh_save',{transaction:t});sessionStorage.removeItem('hh.pending');
      $('hh-amount').value='';$('hh-merchant').value='';$('hh-item').value='';$('hh-note').value='';message('hh-save-status','記録しました。');await refresh();
    }catch(e){message('hh-save-status',e.message+' 入力内容を保持しています。',true);}
    finally{busy=false;$('hh-save').disabled=demo;}
  }
  function resetPreview(){preview=null;importRequest=null;latestClaim=null;$('hh-claim-to-payment').hidden=true;$('hh-import-table').replaceChildren();$('hh-commit').disabled=true;$('hh-import-checked').checked=false;}
  async function importPreview(){
    resetPreview();$('hh-preview').disabled=true;
    try{
      const file=$('hh-file').files[0];if(!file)throw Error('カード明細のCSVを選んでください。');if(file.size>2000000)throw Error('ファイルは2MB以下にしてください。');
      const parsed=CardCsv.parse(CardCsv.decode(await file.arrayBuffer()),file.name,$('hh-import-card').value);
      if(!$('hh-source-id').value.trim())$('hh-source-id').value=parsed.sourceId;
      const body={card:$('hh-import-card').value,sourceId:$('hh-source-id').value.trim(),rows:parsed.rows};
      message('hh-import-status','既存記録と照合しています…');const result=await api('hh_import_preview',body);
      preview={body,rows:result.rows};
      if(parsed.paymentTotal!==null && parsed.paymentTotal>=0){latestClaim={card:body.card,sourceId:body.sourceId,amount:parsed.paymentTotal,date:parsed.paymentDate,filename:file.name};$('hh-claim-to-payment').hidden=false;}
      table('hh-import-table',['日付','店舗','金額','費目','照合結果','候補の行','判断'],result.rows.map(p=>{
        const select=node('select');select.dataset.id=p.id;select.setAttribute('aria-label',p.transaction.date+' '+p.transaction.merchant+' の取込判断');
        const fixed=['登録済','内容競合','対象期間外'].includes(p.status);
        ['', '追加','除外'].forEach(value=>{const o=node('option',value||'選んでください');o.value=value;select.append(o);});
        select.value=fixed?'除外':p.status==='新規'?'追加':'';select.disabled=fixed;
        select.onchange=()=>{importRequest=null;$('hh-import-checked').checked=false;};
        const category=node('select');category.setAttribute('aria-label',p.transaction.merchant+' の費目');
        const options=[...new Set(['未分類',...Array.from($('hh-category').options).map(o=>o.value),p.transaction.category])];
        options.forEach(value=>{const o=node('option',value);o.value=value;category.append(o);});category.value=p.transaction.category;category.disabled=fixed;
        category.onchange=()=>{const row=preview.body.rows.find(r=>r.lineId===p.transaction.lineId);row.category=category.value;importRequest=null;$('hh-import-checked').checked=false;};
        return[p.transaction.date,p.transaction.merchant,money(p.transaction.amount),category,p.status,p.matches.join(', '),select];
      }));
      $('hh-commit').disabled=false;message('hh-import-status',result.rows.length+'件を照合しました。'+(parsed.paymentTotal!==null?' 明細の支払欄合計 '+money(parsed.paymentTotal)+(parsed.paymentDate?'、支払日 '+parsed.paymentDate:'')+'。':'')+' 「要照合」は日付・金額などが一致する候補です。別の買い物なら追加できます。 '+parsed.warnings.join(' '));
    }catch(e){resetPreview();message('hh-import-status',e.message,true);}
    finally{$('hh-preview').disabled=demo;}
  }
  async function importCommit(){
    if(!preview)return;$('hh-commit').disabled=true;
    try{
      if(!$('hh-import-checked').checked)throw Error('照合結果の確認にチェックを入れてください。');
      if(!importRequest){const decisions={},review={};$('hh-import-table').querySelectorAll('select[data-id]').forEach(s=>{decisions[s.dataset.id]=s.value;});if(Object.values(decisions).some(v=>!v))throw Error('すべての行で追加・除外を選んでください。');preview.rows.forEach(p=>review[p.id]=p.matchIds||[]);importRequest={...preview.body,decisions,review};}
      message('hh-import-status','取り込んでいます…');const r=await api('hh_import_commit',importRequest);resetPreview();message('hh-import-status',r.added+'件を追加、'+r.skipped+'件を除外・登録済みとして処理しました。');await refresh();
    }catch(e){message('hh-import-status',e.message+' 途中で通信が切れた場合も、同じ内容で再実行すると登録済みの行は追加されません。',true);$('hh-commit').disabled=false;}
  }
  function editPayment(p){['id','date','name','amount','status','note'].forEach(k=>$('hh-payment-'+k).value=p[k]??'');$('hh-payment-editor').open=true;}
  function newPayment(){editPayment({id:uuid(),date:'',name:'家賃',amount:69125,status:'見込み',note:''});}
  async function claimToPayment(){
    if(!latestClaim)return;
    const claim=latestClaim,digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(claim.card+'|'+claim.sourceId));
    const id='claim:'+Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
    editPayment(knownPayments.find(p=>p.id===id)||{id,date:claim.date,name:claim.card,amount:claim.amount,status:'見込み',note:claim.filename+' の支払欄合計。実際の請求額・支払日を確認してください。'});
    message('hh-payment-message','入力欄に転記しました。日付・金額・状態を確認して保存してください。');$('hh-payment-editor').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function savePayment(e){e.preventDefault();$('hh-payment-save').disabled=true;
    try{const p={};['id','date','name','amount','status','note'].forEach(k=>p[k]=$('hh-payment-'+k).value);await api('hh_payment_save',{payment:p});message('hh-payment-message','予定を保存しました。支出には加算していません。');await refresh();}
    catch(err){message('hh-payment-message',err.message,true);}finally{$('hh-payment-save').disabled=demo;}
  }
  function demoDashboard(month){const categories=[{name:'家賃',amount:69125},{name:'食費',amount:32580},{name:'電気代',amount:12400},{name:'日用雑貨',amount:6830}];return {summary:{expense:120935,income:150000,balance:29065,count:4,categories},trends:Array.from({length:6},(_,i)=>{const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-5+i);return{month:d.toISOString().slice(0,7),expense:[115420,134100,109980,125500,117300,120935][i]};}),coverage:'操作見本の架空データです。本当の支出・収入ではありません。',transactions:[],issues:[],payments:[{id:'demo',date:month+'-27',name:'家賃',amount:69125,status:'見込み',note:'操作見本'}]};}
  $('hh-month').value=today().slice(0,7);$('hh-date').value=today();$('hh-date').max=today();$('hh-key').value=sessionStorage.getItem('hh.key')||'';
  $('hh-connect').onclick=()=>{sessionStorage.setItem('hh.key',$('hh-key').value.trim());$('hh-connection').open=false;refresh();};
  $('hh-refresh').onclick=refresh;$('hh-month').onchange=refresh;$('hh-entry').onsubmit=save;$('hh-method').onchange=()=>$('hh-card').disabled=$('hh-method').value!=='クレジットカード';
  $('hh-preview').onclick=importPreview;$('hh-commit').onclick=importCommit;['hh-file','hh-source-id','hh-import-card'].forEach(id=>$(id).onchange=resetPreview);
  $('hh-file').onchange=()=>{resetPreview();$('hh-source-id').value='';};
  $('hh-payment-form').onsubmit=savePayment;$('hh-payment-new').onclick=newPayment;
  $('hh-claim-to-payment').onclick=claimToPayment;
  $('hh-payment-name').onchange=()=>{$('hh-payment-amount').value=$('hh-payment-name').value==='家賃'?'69125':'';};
  // Do not suggest a precise water/electricity amount without a statement.
  $('hh-payment-id').value=uuid();const prior=pending();if(prior){restoreTransaction(prior);message('hh-save-status','保存結果が未確認の入力を復元しました。同じ内容で記録すると登録済みか確認できます。');}
  if(demo){$('hh-demo').hidden=false;['hh-save','hh-preview','hh-commit','hh-payment-save','hh-connect'].forEach(id=>$(id).disabled=true);}
  if(demo || sessionStorage.getItem('hh.key'))refresh();
})();
