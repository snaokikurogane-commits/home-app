/* Pure read models for the existing life sheets. No writes or permissions. */
var LifeCore = (function () {
  'use strict';
  var days=['mon','tue','wed','thu','fri','sat','sun'];
  function day(value) {
    if(value===null||value===undefined||value==='')return '';
    if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      var exact=new Date(value+'T00:00:00Z');return isNaN(exact.getTime())||exact.toISOString().slice(0,10)!==value?'':value;
    }
    var d=new Date(value);return isNaN(d.getTime())?'':new Date(d.getTime()+9*3600000).toISOString().slice(0,10);
  }
  function weekStart(value) {
    var key=day(value);if(!key)return '';var d=new Date(key+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);
  }
  function schedules(rows,today,period) {
    var date=day(today),past=period==='past';
    return rows.map(function(r){var start=day(r[1]),end=day(r[2])||start;return {name:String(r[0]||''),startDate:start,endDate:end<start?start:end,owner:['naoki','maki'].indexOf(r[3])>=0?r[3]:'common'};})
      .filter(function(e){return e.name&&e.startDate&&(past?e.endDate<date:e.endDate>=date);})
      .sort(function(a,b){return past?b.startDate.localeCompare(a.startDate):a.startDate.localeCompare(b.startDate);});
  }
  function menus(rows,today) {
    var currentWeek=weekStart(today),weeks={},latest=null;
    rows.forEach(function(r){var saved=day(r[0]),week=weekStart(r[0]);if(!week)return;var menu={};days.forEach(function(d,i){menu[d]=String(r[i+1]||'');});var item={week:week,date:saved,menu:menu,menuStr:'月:'+menu.mon+'...日:'+menu.sun};weeks[week]=item;latest=item;});
    return {menu:latest?latest.menu:{},menuSavedAt:latest?latest.date:null,currentWeek:currentWeek,history:Object.keys(weeks).filter(function(w){return w<currentWeek;}).sort().reverse().map(function(w){return weeks[w];})};
  }
  function photos(rows,options) {
    options=options||{};var requested=Math.floor(Number(options.limit)),limit=requested>0?Math.min(50,requested):20;
    var cursor=Math.floor(Number(options.cursor));if(!cursor||cursor<2)cursor=Infinity;
    var query=String(options.query||'').trim().toLowerCase();
    var all=rows.map(function(r,i){return {id:i+2,date:r[0],memo:String(r[1]||''),url:String(r[2]||'')};}).filter(function(p){return p.url&&(!query||p.memo.toLowerCase().indexOf(query)>=0);});
    var eligible=all.filter(function(p){return p.id<cursor;}).reverse(),items=eligible.slice(0,limit),hasMore=eligible.length>items.length;
    return {items:items,total:all.length,hasMore:hasMore,nextCursor:hasMore?items[items.length-1].id:null,pageVersion:1};
  }
  return {day:day,weekStart:weekStart,schedules:schedules,menus:menus,photos:photos};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=LifeCore;
