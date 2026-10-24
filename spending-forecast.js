(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.HHSpendingForecast=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const categories=['家賃','電気代','水道代'];
  function monthIndex(month){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('見込みの対象月を確認してください。');
    return Number(month.slice(0,4))*12+Number(month.slice(5))-1;
  }
  function amount(value,signed=false){
    if(!Number.isSafeInteger(value)||(!signed&&value<0))throw Error('見込みの計算に必要な金額を確認できません。');
    return value;
  }
  function build(data,month,currentMonth){
    const selected=monthIndex(month),current=monthIndex(currentMonth),recorded=amount(data.summary.expense,true);
    const transactions=data.transactions.filter(t=>String(t.date).slice(0,7)===month);
    const prior=data.trends.filter(t=>monthIndex(t.month)<selected).sort((a,b)=>b.month.localeCompare(a.month));
    const payments=data.payments.filter(p=>String(p.date).slice(0,7)===month&&categories.includes(p.name)&&['見込み','確定','支払済'].includes(p.status));
    const rows=categories.map(name=>{
      const actuals=transactions.filter(t=>t.category===name&&t.kind==='支出');
      const actual=actuals.reduce((s,t)=>s+amount(t.amount),0);
      const scheduled=payments.filter(p=>p.name===name);
      let expected=null,basis='金額・今月の予定が未確認';
      if(scheduled.length){
        expected=scheduled.reduce((s,p)=>s+amount(p.amount),0);
        basis='登録した支払予定'+(scheduled.some(p=>p.status==='見込み')?'（見込みを含む）':'');
      }else if(name==='家賃'&&(selected>=current||prior.some(t=>(t.categories||[]).some(c=>c.name===name&&c.amount>0)))){
        expected=69125;basis='毎月の固定額';
      }else if(actuals.length){
        expected=actual;basis='今月の記録済み額';
      }else if(name==='電気代'){
        const reference=prior.find(t=>selected-monthIndex(t.month)<=2&&(t.categories||[]).some(c=>c.name===name&&Number.isSafeInteger(c.amount)&&c.amount>0));
        if(reference){expected=amount(reference.categories.find(c=>c.name===name).amount);basis=reference.month+'の記録から概算';}
      }
      return {name,actual,expected,pending:expected===null?null:Math.max(0,expected-actual),basis};
    });
    const pending=rows.reduce((s,r)=>s+(r.pending===null?0:r.pending),0),total=recorded+pending;
    amount(total,true);
    return {month,recorded,pending,total,rows,unknown:rows.filter(r=>r.expected===null).map(r=>r.name),hasSpendingRecords:transactions.some(t=>['支出','返金'].includes(t.kind))};
  }
  return {build};
});
