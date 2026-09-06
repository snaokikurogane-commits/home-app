/* Pure household rules. No Google/LINE calls; also exercised by Node tests. */
var HouseholdCore = (function () {
  'use strict';
  var cards = ['楽天（共同）', 'Amazon（共同）', 'PayPay（共同）'];
  function fail(message) { throw new Error(message); }
  function str(value, max) {
    var s = String(value == null ? '' : value).trim();
    if (s.length > (max || 200)) fail('文字数が上限を超えています。');
    return s;
  }
  function date(value) {
    var s = str(value), m = /^(20\d{2})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) fail('日付は YYYY-MM-DD で指定してください。');
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.toISOString().slice(0, 10) !== s) fail('存在しない日付です。');
    return s;
  }
  function money(value, allowZero) {
    var s = str(value).replace(/,/g, '');
    if (!/^\d+$/.test(s)) fail('金額は正の整数（円）で入力してください。');
    var n = Number(s);
    if (!Number.isSafeInteger(n) || n > 100000000 || n < (allowZero ? 0 : 1)) fail('金額が範囲外です。');
    return n;
  }
  function transaction(input, today) {
    var t = {
      id: str(input.id, 180), date: date(input.date), kind: str(input.kind), scope: '共同',
      payer: str(input.payer || '共同'), category: str(input.category || '未分類'),
      method: str(input.method), card: str(input.card), merchant: str(input.merchant),
      amount: money(input.amount), item: str(input.item, 500), note: str(input.note, 500),
      source: str(input.source || '手入力'), sourceId: str(input.sourceId, 180), lineId: str(input.lineId, 80)
    };
    if (!/^[a-zA-Z0-9:_-]{8,180}$/.test(t.id)) fail('取引IDが不正です。');
    if (t.date > today) fail('未来の引き落としは「支払予定」に入力してください。');
    if (!['支出', '収入', '返金'].includes(t.kind)) fail('収支区分が不正です。');
    if (!['現金', 'クレジットカード', '口座振替', '銀行振込'].includes(t.method)) fail('支払方法を選んでください。');
    if (t.method === 'クレジットカード' && !cards.includes(t.card)) fail('共同カードを選んでください。');
    if (t.method !== 'クレジットカード') t.card = '';
    if (t.category === '日用品') t.category = '日用雑貨';
    if (t.category === 'その他') t.category = t.kind === '収入' ? '収入その他' : '支出その他';
    return t;
  }
  function key(t) { return [t.date, t.kind, t.amount, t.method, t.card, t.merchant.replace(/\s/g, '').toLowerCase()].join('|'); }
  function same(a, b) {
    return ['date','kind','scope','payer','category','method','card','merchant','amount','item','note','source','sourceId','lineId'].every(function(k) { return String(a[k] || '') === String(b[k] || ''); });
  }
  function candidates(t, list) {
    return list.filter(function (r) {
      return r.date === t.date && r.kind === t.kind && r.amount === t.amount &&
        (r.method === t.method || !r.method) && (!r.card || !t.card || r.card === t.card);
    });
  }
  function summary(list, month) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) fail('集計月を選んでください。');
    var categories = Object.create(null), income = 0, expense = 0, count = 0;
    list.forEach(function (r) {
      if (r.scope !== '共同' || r.date.slice(0, 7) !== month) return;
      count++;
      if (r.kind === '収入') income += r.amount;
      else { var n = r.kind === '返金' ? -r.amount : r.amount; expense += n; categories[r.category] = (categories[r.category] || 0) + n; }
    });
    return {month: month, income: income, expense: expense, balance: income - expense, count: count,
      categories: Object.keys(categories).map(function(k) { return {name:k, amount:categories[k]}; }).sort(function(a,b) { return b.amount-a.amount; })};
  }
  function payment(input) {
    var p = {id:str(input.id,180), date:date(input.date), name:str(input.name), amount:money(input.amount,true), status:str(input.status), note:str(input.note,500)};
    if (!/^[a-zA-Z0-9:_-]{8,180}$/.test(p.id) || !p.name) fail('支払予定のIDと項目名が必要です。');
    if (!['見込み','確定','支払済'].includes(p.status)) fail('予定の状態を選んでください。');
    return p;
  }
  return {cards:cards,date:date,money:money,transaction:transaction,key:key,same:same,candidates:candidates,summary:summary,payment:payment};
})();
