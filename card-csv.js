/* Formats verified against the shared Rakuten, Amazon Master and PayPay CSVs. */
var CardCsv = (function () {
  'use strict';
  const normalize=s=>String(s||'').normalize('NFKC').trim();
  function number(s){s=normalize(s).replace(/,/g,'');if(!/^-?\d+$/.test(s))throw Error('明細の金額を読み取れません。');const n=Number(s);if(!Number.isSafeInteger(n))throw Error('金額が大きすぎます。');return n;}
  function date(s){const m=/^(20\d{2})\/(\d{1,2})\/(\d{1,2})$/.exec(normalize(s));if(!m)throw Error('利用日を読み取れません。');return HouseholdCore.date(m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'));}
  function category(store){
    const s=normalize(store).replace(/\s/g,'').toUpperCase();
    if(/GMOとくとくBB/i.test(s))return '通信費';
    if(/マクドナルド|マクドナルド|ハマズシ|リンガ-ハツト|リンガーハット|ホツトモツト|ゴンチヤ/.test(s))return '外食';
    if(/ニツトウシヨクセン|ギヨウムス-パ-|ギョウムス-パ-|マツクスバリユ|フジマツエテン/.test(s))return '食費';
    if(/太陽石油|イデミツ|シンイデミツ/.test(s))return '交通費';
    return '未分類';
  }
  function parse(text,filename,selectedCard){
    const records=HHClientCore.csvRows(text);if(!records.length)throw Error('明細が空です。');
    const header=records[0].map(normalize);let format;
    if(header.includes('lineId')&&header.includes('date'))return {format:'共通CSV',card:selectedCard,rows:HHClientCore.csv(text),warnings:[],paymentTotal:null,paymentDate:'',sourceId:'',categorySuggestions:false};
    if(header.includes('利用日/キャンセル日'))format='PayPay';
    else if(header.includes('利用日')&&header.includes('手数料/利息'))format='楽天';
    else if(header.some(s=>/Amazonマスター/i.test(s)))format='Amazon';
    else throw Error('対応している共同カードのCSV形式ではありません。');
    const card={楽天:'楽天（共同）',Amazon:'Amazon（共同）',PayPay:'PayPay（共同）'}[format];
    if(selectedCard && selectedCard!==card)throw Error('選択したカードとCSVの形式が違います。'+card+' を選んでください。');
    const monthMatch=/(20\d{2})(0[1-9]|1[0-2])/.exec(filename||'');
    const sourceId=monthMatch?monthMatch[1]+'-'+monthMatch[2]+'請求':'';
    const rows=[],warnings=[],paymentDates=new Set();let paymentTotal=0,footerTotal=null;
    const idx=name=>{const n=header.indexOf(name);if(n<0)throw Error('CSVの列が不足しています：'+name);return n;};
    const payColumn=format==='楽天'?header.findIndex(h=>/^\d{1,2}月支払金額$/.test(h)):-1;
    if(format==='楽天'&&payColumn<0)throw Error('楽天の月別支払金額列がありません。');
    for(let i=1;i<records.length;i++){
      const r=records[i];let used,store,amount,paid,detail='';
      if(format==='Amazon'){
        if(!r[0]){
          if(r[5] && r.every((v,j)=>j===5||!v)){if(footerTotal!==null)throw Error('Amazon明細の合計行が複数あります。');footerTotal=number(r[5]);continue;}
          throw Error('Amazon明細の'+(i+1)+'行目を確認してください。');
        }
        if(normalize(r[3])!=='1'||normalize(r[4])!=='1')throw Error('分割・リボのAmazon明細は個別の確認が必要です。');
        used=date(r[0]);store=r[1];amount=number(r[2]);paid=number(r[5]);detail=r[6]||'';
      }else{
        if(!r[0]){
          if(r[1] && r.every((v,j)=>j===1||!v) && rows.length){rows[rows.length-1].note+=' ／ 明細補足：'+r[1];continue;}
          throw Error('日付のない明細行を確認してください：'+(i+1));
        }
        if(r.length!==header.length)throw Error('明細の列数が合いません：'+(i+1));
        used=date(r[0]);store=r[idx('利用店名・商品名')];amount=number(r[idx('利用金額')]);
        const paymentMethod=normalize(r[idx(format==='楽天'?'支払方法':'支払区分')]);
        if(!['1回','1回払い'].includes(paymentMethod))throw Error('分割・リボ・特殊な支払区分は個別の確認が必要です：'+(i+1));
        const fee=number(r[idx(format==='楽天'?'手数料/利息':'手数料')]);
        if(fee!==0)throw Error('手数料のある明細は個別の確認が必要です：'+(i+1));
        paid=number(r[format==='楽天'?payColumn:idx('当月支払金額')]);
        if(format==='PayPay'){
          if(number(r[idx('調整額')])!==0||number(r[idx('翌月以降繰越金額')])!==0)throw Error('調整額・繰越金額があるPayPay明細は個別に確認してください。');
          paymentDates.add(date(r[idx('当月お支払日')]));
        }
      }
      if(!amount || amount!==paid)throw Error('利用額と当月支払額が一致しない行は個別に確認してください：'+(i+1));
      const guess=category(store),notes=['元ファイル：'+filename,'明細レコード：'+(i+1)];
      if(guess!=='未分類')notes.push('費目は店名による仮分類');if(detail)notes.push(detail);
      rows.push({lineId:'record-'+(i+1),date:used,kind:amount<0?'返金':'支出',amount:Math.abs(amount),merchant:store,category:guess,item:'',note:notes.join(' ／ ')});
      paymentTotal+=paid;
    }
    if(!rows.length)throw Error('利用明細がありません。');
    if(format==='Amazon'&&(footerTotal===null||footerTotal!==paymentTotal))throw Error('Amazon明細の利用合計と末尾の合計が一致しません。');
    if(paymentDates.size>1)throw Error('引き落とし日が複数あるCSVは分けてください。');
    if(format==='楽天' && monthMatch && Number(header[payColumn].match(/^\d+/)[0])!==Number(monthMatch[2]))throw Error('ファイル名の月と支払金額の月が違います。');
    warnings.push('費目は店名による候補です。Amazonなど商品が分からない利用先は未分類です。');
    if(!sourceId)warnings.push('ファイル名から請求月を読み取れません。明細IDを入力してください。');
    return {format,card,rows,warnings,paymentTotal,paymentDate:[...paymentDates][0]||'',sourceId,categorySuggestions:true};
  }
  function decode(buffer){try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch(e){return new TextDecoder('shift_jis',{fatal:true}).decode(buffer);}}
  return {parse,decode,category};
})();
if(typeof module!=='undefined')module.exports=CardCsv;
