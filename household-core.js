var HHClientCore = (function () {
  'use strict';
  function csvRows(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = []; let row = [], field = '', quoted = false, closed = false;
    for (let i=0;i<text.length;i++) {
      const c=text[i];
      if (quoted) { if(c==='"') {if(text[i+1]==='"'){field+='"';i++;} else {quoted=false;closed=true;}} else field+=c; }
      else if(c==='"') {if(field || closed) throw Error('CSVの引用符を確認してください。');quoted=true;}
      else if(c===',') {row.push(field);field='';closed=false;}
      else if(c==='\r'||c==='\n') {if(c==='\r'&&text[i+1]==='\n') i++;row.push(field);if(row.some(x=>x!==''))rows.push(row);row=[];field='';closed=false;}
      else {if(closed) throw Error('CSVの引用符の後に文字があります。');field+=c;}
    }
    if(quoted) throw Error('CSVの引用符が閉じていません。');
    row.push(field);if(row.some(x=>x!=='')) rows.push(row);
    return rows;
  }
  function csv(text) {
    const rows=csvRows(text),headers=rows.shift();
    const required=['lineId','date','kind','amount','merchant'];
    if(!headers || new Set(headers).size!==headers.length || required.some(h=>!headers.includes(h))) throw Error('指定のCSV見出しが必要です：'+required.join(', '));
    return rows.map((r,i)=>{if(r.length!==headers.length)throw Error('CSV '+(i+2)+' 行目の列数が違います。');return Object.fromEntries(headers.map((h,n)=>[h,r[n]]));});
  }
  function makeRequest(transaction, accessKey) { return {type:'web_app',action:'hh_save',transaction,accessKey}; }
  async function send(url, body, fetchFn) {
    const response = await fetchFn(url,{method:'POST',body:JSON.stringify(body),redirect:'follow'});
    if(!response.ok) throw Error('通信に失敗しました。入力を残しています。');
    let result; try{result=await response.json();}catch(e){throw Error('保存結果を確認できません。入力を残しています。');}
    if(result.status!=='success')throw Error(result.message || '保存できませんでした。');
    return result;
  }
  function connectionStore(session,device){
    const name='hh.key',read=store=>{try{return (store.getItem(name)||'').trim();}catch(e){return '';}};
    const remove=store=>{try{store.removeItem(name);}catch(e){if(read(store))throw e;}};
    let active=read(session)||read(device),remember=!!active && read(device)===active;
    return {
      key:()=>active,remembered:()=>remember,
      async connect(value,keep,verify){
        const key=String(value||'').trim();if(!key)throw Error('接続キーを入力してください。');
        const result=await verify(key),target=keep?device:session,other=keep?session:device,prior=read(target);
        try{target.setItem(name,key);remove(other);}
        catch(e){try{if(prior)target.setItem(name,prior);else target.removeItem(name);}catch(ignored){}throw Error('接続キーを保存できません。「今回だけ」を選ぶか、ブラウザーの保存設定をご確認ください。');}
        active=key;remember=!!keep;return result;
      },
      disconnect(){try{remove(session);remove(device);}catch(e){throw Error('保存したキーを解除できません。ブラウザーの保存設定をご確認ください。');}active='';remember=false;}
    };
  }
  function dashboardOverview(data,month){
    const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);
    const previous=(data.trends||[]).find(r=>r.month===date.toISOString().slice(0,7));
    const payments=(data.payments||[]).filter(p=>p.date.slice(0,7)===month && ['確定','見込み'].includes(p.status));
    return {difference:previous?data.summary.expense-previous.expense:null,unpaid:payments.reduce((n,p)=>n+p.amount,0),estimated:payments.filter(p=>p.status==='見込み').reduce((n,p)=>n+p.amount,0)};
  }
  function categoryDetails(rows,month,category){
    const transactions=rows.filter(r=>r.scope==='共同' && r.date.slice(0,7)===month && r.category===category && ['支出','返金'].includes(r.kind))
      .sort((a,b)=>b.date.localeCompare(a.date));
    const expense=transactions.filter(r=>r.kind==='支出').reduce((n,r)=>n+r.amount,0);
    const refund=transactions.filter(r=>r.kind==='返金').reduce((n,r)=>n+r.amount,0);
    return {transactions,expense,refund,net:expense-refund};
  }
  return {csv,csvRows,makeRequest,send,connectionStore,dashboardOverview,categoryDetails};
})();
if(typeof module!=='undefined')module.exports=HHClientCore;
