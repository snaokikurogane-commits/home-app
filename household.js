(function () {
  'use strict';
  const $ = id=>document.getElementById(id), money=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY'}).format(n);
  const demo=new URLSearchParams(location.search).get('demo')==='1';
  const storage=kind=>({getItem:key=>window[kind].getItem(key),setItem:(key,value)=>window[kind].setItem(key,value),removeItem:key=>window[kind].removeItem(key)});
  const connection=HHClientCore.connectionStore(storage('sessionStorage'),storage('localStorage'));
  let preview=null, importRequest=null, latestClaim=null, busy=false, refreshNumber=0, knownPayments=[],billing=null;
  let chartFormat='bar',chartState=null;
  const recordMotion=HHVisuals.recordMotion($('hh-record-rabbit'));
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const uuid=()=>crypto.randomUUID();
  function message(id,text,error=false){$(id).textContent=text;$(id).dataset.error=String(error);}
  function node(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
  function pending(){try{return JSON.parse(sessionStorage.getItem('hh.pending')||'null');}catch(e){return null;}}
  async function api(action, fields={}) {
    if(demo){if(action==='hh_dashboard')return demoDashboard(fields.month);throw Error('操作見本では保存できません。');}
    const accessKey=connection.key();
    if(!accessKey){setView('manage');$('hh-connection').open=true;throw Error('接続設定に家計簿の接続キーを入力してください。');}
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
  function categoryBars(items,rows,month){
    const target=$('hh-categories'),max=Math.max(1,...items.map(r=>Math.abs(r.amount)));target.replaceChildren();target.setAttribute('aria-busy','false');
    const chart=HHVisuals.chartData(items);
    items.forEach((r,index)=>{
      const detail=HHClientCore.categoryDetails(rows,month,r.name),box=node('details'),toggle=node('summary'),heading=node('span'),amount=node('strong',money(r.amount)),chevron=node('span');
      box.className='hh-category';box.id='hh-category-'+index;box.style.setProperty('--category-color',HHVisuals.categoryColor(r.name));box.dataset.negative=String(r.amount<0);toggle.id='hh-category-toggle-'+index;heading.className='hh-category-heading';amount.className='hh-category-amount';chevron.className='hh-category-chevron';chevron.setAttribute('aria-hidden','true');
      const label=node('span'),dot=node('span'),name=node('span',r.name),percent=node('small',r.amount>0?(r.amount/chart.positiveTotal*100).toFixed(1).replace(/\.0$/,'')+'%':r.amount<0?'返金超過':'差引0円');label.className='hh-category-name';dot.className='hh-category-dot';dot.setAttribute('aria-hidden','true');percent.className='hh-category-percent';label.append(dot,name,percent);
      heading.append(label,amount,chevron);const track=node('span'),bar=node('i');track.className='hh-category-track';bar.style.width=(100*Math.abs(r.amount)/max)+'%';track.setAttribute('aria-hidden','true');track.append(bar);toggle.append(heading,track);
      const list=node('div');list.className='hh-category-list';list.setAttribute('role','group');list.setAttribute('aria-labelledby',toggle.id);
      const count=node('p',detail.transactions.length+'件の明細'+(detail.refund?'（支出 '+money(detail.expense)+' − 返金 '+money(detail.refund)+'）':''));count.className='hh-note';list.append(count);
      detail.transactions.forEach(t=>list.append(transactionCard(t)));
      if(!detail.transactions.length)list.append(node('p','表示できる明細がありません。更新して確認してください。'));
      const close=node('button','内訳を閉じる');close.type='button';close.className='hh-text-button';list.append(close);box.append(toggle,list);target.append(box);const closeDisclosure=HHVisuals.enhanceDisclosure(box,list);close.onclick=()=>closeDisclosure(true);
    });
    if(!items.length)target.append(node('p','この月はまだ記録がありません。'));
  }
  function renderCategoryChart(){
    const svg=$('hh-donut'),ready=!!chartState,items=chartState?.categories||[],chart=HHVisuals.chartData(items);
    $('hh-categories').dataset.chart=chartFormat;$('hh-donut-wrap').hidden=chartFormat!=='donut';$('hh-donut-total').textContent=ready?money(chartState.expense):'—';svg.replaceChildren();
    function circle(attrs){const c=document.createElementNS('http://www.w3.org/2000/svg','circle');Object.entries(attrs).forEach(([k,v])=>c.setAttribute(k,v));svg.append(c);return c;}
    circle({cx:110,cy:110,r:84,fill:'none',stroke:'#eee9dc','stroke-width':30});
    chart.slices.forEach(slice=>{
      const c=circle({cx:110,cy:110,r:84,fill:'none',stroke:HHVisuals.categoryColor(slice.name),'stroke-width':30,pathLength:100,'stroke-dasharray':(slice.fraction*100)+' '+(100-slice.fraction*100),'stroke-dashoffset':-slice.start*100,transform:'rotate(-90 110 110)',class:'hh-donut-segment',role:'button',tabindex:chartFormat==='donut'?0:-1,'aria-label':slice.name+' '+money(slice.amount)+'、'+(slice.fraction*100).toFixed(1)+'%。明細を開く'});
      const open=()=>{const index=items.findIndex(category=>category.name===slice.name),box=$('hh-category-'+index);if(!box)return;box.open=true;box.querySelector('summary').focus({preventScroll:true});box.scrollIntoView({block:'center',behavior:HHVisuals.reduced()?'instant':'smooth'});};
      c.addEventListener('click',open);c.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
    });
    const text=!ready?'接続すると記録済みの支出を表示します。':!items.length?'この月に記録された支出・返金はありません。未入力分は含みません。':!chart.positiveTotal?'プラスの費目がないため、円の割合は表示していません。返金を含む明細は下から確認できます。':chartFormat==='donut'&&chart.negativeTotal<0?'円の割合はプラスの費目 '+money(chart.positiveTotal)+' が対象です。返金超過 '+money(chart.negativeTotal)+' は下に別表示しています。':'';
    $('hh-chart-message').textContent=text;$('hh-chart-message').hidden=!text;
  }
  function setView(name){
    if(!['overview','record','manage'].includes(name))return;
    if(name!=='record')recordMotion.leave();
    document.querySelectorAll('.hh-view').forEach(panel=>panel.hidden=panel.id!=='hh-view-'+name);
    document.querySelectorAll('.hh-view-tabs button').forEach(button=>{const selected=button.dataset.hhView===name;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
    if(name==='record')recordMotion.enter();
  }
  function connectionState(){
    $('hh-connection-state').textContent=connection.key()?(connection.remembered()?'接続済み・この端末':'接続済み'):'接続する';
    $('hh-disconnect').hidden=!connection.key();$('hh-start-connect').hidden=!!connection.key();
    $('hh-key').placeholder=connection.key()?'変更する場合だけ入力してください':'初回の接続キーを入力';
  }
  function transactionCard(r){
    const card=node('article');card.className='hh-transaction';const head=node('div');head.className='hh-transaction-head';head.append(node('strong',r.merchant||r.item||r.category),node('strong',(r.kind==='返金'?'−':'')+money(r.amount)));card.append(head,node('p',[r.date,r.kind,r.category,r.card||r.method].filter(Boolean).join(' · ')));if(r.item&&r.merchant)card.append(node('p',r.item));
    if(Number.isInteger(r.row))card.append(node('small','元の記録：Data '+r.row+'行'));
    return card;
  }
  function transactions(rows){
    const target=$('hh-transactions');target.replaceChildren();
    if(!rows.length){target.append(node('p','この月の記録はまだありません。'));return;}
    rows.forEach(r=>target.append(transactionCard(r)));
  }
  function renderBilling(data){
    const select=$('hh-billing-month'),selected=select.value;billing=data;select.replaceChildren();select.disabled=!data;
    if(data){data.months.forEach(m=>{const o=node('option',m.slice(0,4)+'年'+Number(m.slice(5))+'月');o.value=m;select.append(o);});select.value=data.months.includes(selected)?selected:data.currentMonth;}
    drawBilling();
  }
  function drawBilling(){
    const s=billing?.summaries[$('hh-billing-month').value],target=$('hh-billing-cards');target.replaceChildren();$('hh-billing-total').textContent=s&&s.total!=null?money(s.total):'—';$('hh-billing-total-label').textContent=s&&!s.complete?'取込済みの小計':'明細額の合計';
    if(!s){$('hh-billing-status').textContent='請求情報はまだ読み込めていません。';return;}
    s.cards.forEach(c=>{const row=node('div'),label=node('div'),date=node('small',c.amount==null?'明細未取込':c.date?'引落日 '+c.date.replaceAll('-','/'):'引落日 未確認');row.className='hh-bill-row';label.append(node('span',c.card),date);row.append(label,node('strong',c.amount==null?'—':money(c.amount)));target.append(row);});
    $('hh-billing-status').textContent=s.complete?'全'+s.cards.length+'枚の明細を取込済みです。カード会社の確定額・引落日とあわせてご確認ください。':s.known+'／'+s.cards.length+'枚を取込済み。未取込のカードがあるため、全カードの請求合計は未確定です。';
  }
  async function refresh(validated){
    const request=++refreshNumber, month=$('hh-month').value;
    message('hh-status','共同家計を読み込んでいます…');
    $('hh-categories').replaceChildren(node('p','内訳を読み込んでいます…'));$('hh-categories').setAttribute('aria-busy','true');
    try{
      const data=validated && validated.month===month && validated.data?validated.data:await api('hh_dashboard',{month});if(request!==refreshNumber)return;
      const s=data.summary;$('hh-expense').textContent=money(s.expense);$('hh-income').textContent=money(s.income);$('hh-balance').textContent=money(s.balance);
      const overview=HHClientCore.dashboardOverview(data,month);$('hh-month-diff').textContent=overview.difference===null?'—':(overview.difference>0?'+':'')+money(overview.difference);$('hh-upcoming').textContent=money(overview.unpaid);$('hh-upcoming-note').textContent=overview.estimated?'うち見込み '+money(overview.estimated):'選択月の未払い分';
      $('hh-coverage').textContent=data.coverage+' 収支差額は口座残高ではありません。';
      categoryBars(s.categories,data.transactions,month);chartState={categories:s.categories,expense:s.expense};renderCategoryChart();bars('hh-trends',data.trends.map(r=>({name:r.month,amount:r.expense})));
      transactions(data.transactions);
      $('hh-issues').replaceChildren(...data.issues.map(r=>node('li','Data '+r.row+'行：'+r.message)));
      if(!data.issues.length)$('hh-issues').append(node('li','除外した共同取引はありません。'));
      knownPayments=data.payments;renderBilling(data.billing);
      const payments=data.payments.filter(r=>r.date.slice(0,7)===month).sort((a,b)=>a.date.localeCompare(b.date));
      table('hh-payments',['日付','項目','金額','状態','修正'],payments.map(p=>{const b=node('button','修正');b.type='button';b.onclick=()=>editPayment(p);return[p.date,p.name,money(p.amount),p.status,b];}));
      const total=status=>payments.filter(p=>p.status===status).reduce((s,p)=>s+p.amount,0);
      $('hh-payment-total').textContent='未払いの確定分 '+money(total('確定'))+' ／ 見込み '+money(total('見込み'))+' ／ 支払済 '+money(total('支払済'))+'。登録済みの予定のみです。';
      message('hh-status',demo?'架空データの操作見本を表示しています。':s.count+'件を集計しました。');
    }catch(e){if(request===refreshNumber){clearDashboard();message('hh-status',e.message,true);}}
  }
  function clearDashboard(){renderBilling(null);chartState=null;renderCategoryChart();$('hh-categories').setAttribute('aria-busy','false');['hh-expense','hh-income','hh-balance','hh-month-diff','hh-upcoming'].forEach(id=>$(id).textContent='—');['hh-categories','hh-trends','hh-transactions','hh-payments','hh-issues'].forEach(id=>$(id).replaceChildren());$('hh-upcoming-note').textContent='選択月の未払い分';$('hh-payment-total').textContent='読込未完了';$('hh-coverage').textContent='読み込めなかったため、金額を表示していません。';}
  async function connect(){
    const key=$('hh-key').value.trim()||connection.key(),keep=$('hh-remember').value==='device',month=$('hh-month').value;
    $('hh-connect').disabled=true;$('hh-disconnect').disabled=true;message('hh-connection-message','接続を確認しています…');
    try{const data=await connection.connect(key,keep,value=>HHClientCore.send(GAS_URL,{type:'web_app',action:'hh_dashboard',accessKey:value,month},fetch));$('hh-key').value='';connectionState();$('hh-connection').open=false;message('hh-connection-message',keep?'この端末に記憶しました。':'このタブを開いている間だけ接続します。');setView('overview');await refresh({data,month});}
    catch(e){message('hh-connection-message',e.message,true);}
    finally{$('hh-connect').disabled=demo;$('hh-disconnect').disabled=false;}
  }
  function disconnect(){try{connection.disconnect();++refreshNumber;knownPayments=[];resetPreview();clearDashboard();$('hh-key').value='';$('hh-remember').value='session';connectionState();setView('manage');$('hh-connection').open=true;message('hh-connection-message','保存した接続キーを解除しました。');message('hh-status','接続設定から、もう一度接続できます。');}catch(e){message('hh-connection-message',e.message,true);}}
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
    }catch(e){clearDashboard();message('hh-save-status',e.message+' 入力内容を保持しています。',true);}
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
      const claim=HHClientCore.statementClaim(parsed,body.sourceId,body.card,file.name);if(claim)body.claim=claim;
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
    }catch(e){clearDashboard();message('hh-import-status',e.message+' 途中で通信が切れた場合も、同じ内容で再実行すると登録済みの行は追加されません。',true);$('hh-commit').disabled=false;}
  }
  function editPayment(p){['id','date','name','amount','status','note'].forEach(k=>$('hh-payment-'+k).value=p[k]??'');setView('manage');$('hh-payment-editor').open=true;}
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
    catch(err){clearDashboard();message('hh-payment-message',err.message,true);}finally{$('hh-payment-save').disabled=demo;}
  }
  function demoDashboard(month){
    const transactions=[
      {date:month+'-01',kind:'支出',category:'家賃',merchant:'家賃',amount:69125,method:'口座振替'},
      {date:month+'-03',kind:'支出',category:'食費',merchant:'スーパー',amount:20640,method:'クレジットカード',card:'楽天（共同）'},
      {date:month+'-07',kind:'支出',category:'食費',merchant:'スーパー',amount:11940,method:'クレジットカード',card:'楽天（共同）'},
      {date:month+'-10',kind:'支出',category:'電気代',merchant:'電気代',amount:12400,method:'口座振替'},
      {date:month+'-11',kind:'支出',category:'日用雑貨',merchant:'Amazon',item:'洗剤・消耗品',amount:4360,method:'クレジットカード',card:'Amazon（共同）'},
      {date:month+'-13',kind:'支出',category:'日用雑貨',merchant:'ドラッグストア',item:'生活用品',amount:2470,method:'現金'},
      {date:month+'-01',kind:'収入',category:'生活費入金',merchant:'共同口座への入金',amount:150000,method:'口座入金'}
    ].map((r,i)=>({...r,id:'demo:'+i,scope:'共同'}));
    const categories=[{name:'家賃',amount:69125},{name:'食費',amount:32580},{name:'電気代',amount:12400},{name:'日用雑貨',amount:6830}];return {summary:{expense:120935,income:150000,balance:29065,count:transactions.length,categories},trends:Array.from({length:6},(_,i)=>{const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-5+i);return{month:d.toISOString().slice(0,7),expense:[115420,134100,109980,125500,117300,120935][i]};}),billing:{currentMonth:today().slice(0,7),months:[today().slice(0,7)],summaries:{[today().slice(0,7)]:{known:3,complete:true,total:36940,cards:[{card:'楽天（共同）',amount:32580,date:today().slice(0,7)+'-27'},{card:'Amazon（共同）',amount:4360,date:''},{card:'PayPay（共同）',amount:0,date:today().slice(0,7)+'-27'}]}}},coverage:'操作見本の架空データです。本当の支出・収入ではありません。',transactions,issues:[],payments:[{id:'demo',date:month+'-27',name:'家賃',amount:69125,status:'見込み',note:'操作見本'}]};}
  $('hh-month').value=today().slice(0,7);$('hh-date').value=today();$('hh-date').max=today();$('hh-remember').value=connection.remembered()?'device':'session';connectionState();
  $('hh-connect').onclick=connect;$('hh-disconnect').onclick=disconnect;$('hh-billing-month').onchange=drawBilling;
  document.querySelectorAll('[data-hh-chart]').forEach(button=>button.onclick=()=>{if(chartFormat===button.dataset.hhChart)return;chartFormat=button.dataset.hhChart;document.querySelectorAll('[data-hh-chart]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderCategoryChart();if(!HHVisuals.reduced()&&$('hh-category-chart').animate)$('hh-category-chart').animate([{opacity:.25,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});});
  renderCategoryChart();
  document.querySelectorAll('[data-hh-view]').forEach(button=>button.onclick=()=>{setView(button.dataset.hhView);if(button.id==='hh-connection-state'||button.id==='hh-start-connect')$('hh-connection').open=true;});
  document.querySelectorAll('.hh-view-tabs button').forEach((button,index,buttons)=>button.onkeydown=event=>{let next;if(event.key==='ArrowRight')next=(index+1)%buttons.length;else if(event.key==='ArrowLeft')next=(index+buttons.length-1)%buttons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;event.preventDefault();buttons[next].click();buttons[next].focus();});
  $('hh-open-payments').onclick=()=>{setView('manage');$('hh-payment-editor').open=true;$('hh-payment-editor').scrollIntoView({block:'start',behavior:'smooth'});};
  $('hh-refresh').onclick=refresh;$('hh-month').onchange=refresh;$('hh-entry').onsubmit=save;$('hh-method').onchange=()=>$('hh-card').disabled=$('hh-method').value!=='クレジットカード';
  $('hh-preview').onclick=importPreview;$('hh-commit').onclick=importCommit;['hh-file','hh-source-id','hh-import-card'].forEach(id=>$(id).onchange=resetPreview);
  $('hh-file').onchange=()=>{resetPreview();$('hh-source-id').value='';};
  $('hh-payment-form').onsubmit=savePayment;$('hh-payment-new').onclick=newPayment;
  $('hh-claim-to-payment').onclick=claimToPayment;
  $('hh-payment-name').onchange=()=>{$('hh-payment-amount').value=({'家賃':'69125','水道代':'5000'})[$('hh-payment-name').value]||'';};
  // Do not suggest a precise water/electricity amount without a statement.
  $('hh-payment-id').value=uuid();const prior=pending();if(prior){restoreTransaction(prior);message('hh-save-status','保存結果が未確認の入力を復元しました。同じ内容で記録すると登録済みか確認できます。');}
  if(demo){$('hh-demo').hidden=false;['hh-save','hh-preview','hh-commit','hh-payment-save','hh-connect'].forEach(id=>$(id).disabled=true);}
  if(demo || connection.key())refresh();
})();
