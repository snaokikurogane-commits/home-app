(function(root,factory){
  'use strict';
  const api=factory(typeof module==='object'&&module.exports?require('./spending-forecast.js'):root.HHSpendingForecast);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.HHPaymentOutlook=api;
})(typeof globalThis==='object'?globalThis:this,function(forecast){
  'use strict';
  const names=['楽天（共同）','Amazon（共同）','PayPay（共同）'],fixedNames=['家賃','電気代','水道代'];
  const direct=t=>['口座振替','銀行振込'].includes(t.method);
  function amount(n){if(!Number.isSafeInteger(n)||n<0)throw Error('支払見込みの金額を確認できません。');return n;}
  function build(data,month,currentMonth){
    const cardData=data.billing?.summaries?.[month]?.cards||[];
    const cards=names.map(name=>{const row=cardData.find(c=>c.card===name);return {name,amount:row?.amount==null?null:amount(row.amount),date:row?.date||''};});
    const current=data.transactions.filter(t=>String(t.date).slice(0,7)===month&&direct(t));
    const fixed=forecast.build({...data,transactions:current},month,currentMonth).rows.map(row=>{
      const refund=current.filter(t=>t.category===row.name&&t.kind==='返金').reduce((sum,t)=>sum+amount(t.amount),0);
      return {...row,refund,amount:row.expected===null?(refund?-refund:null):Math.max(row.actual,row.expected)-refund};
    });
    const other=current.filter(t=>!fixedNames.includes(t.category)&&['支出','返金'].includes(t.kind)).reduce((sum,t)=>sum+(t.kind==='返金'?-1:1)*amount(t.amount),0);
    const known=cards.filter(c=>c.amount!==null),cardsTotal=known.length?known.reduce((s,c)=>s+c.amount,0):null;
    const bankTotal=fixed.reduce((sum,r)=>sum+(r.amount===null?0:r.amount),other),total=(cardsTotal===null?0:cardsTotal)+bankTotal;
    if(!Number.isSafeInteger(total))throw Error('支払見込みの合計を確認できません。');
    return {month,cards,cardsTotal,bankTotal,total,fixed,other,unknown:[...cards.filter(c=>c.amount===null).map(c=>c.name),...fixed.filter(r=>r.expected===null).map(r=>r.name)],dateUnconfirmed:cards.filter(c=>c.amount!==null&&!c.date).map(c=>c.name)};
  }
  return {build};
});
