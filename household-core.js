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
  return {csv,csvRows,makeRequest,send};
})();
if(typeof module!=='undefined')module.exports=HHClientCore;
