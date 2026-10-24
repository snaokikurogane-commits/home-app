/* Registered records, built on the existing life-sheet actions. */
(function(root,doc){
  'use strict';
  const $=id=>doc.getElementById(id),days=['mon','tue','wed','thu','fri','sat','sun'],labels=['月','火','水','木','金','土','日'];
  const people={naoki:'尚輝',maki:'真輝',common:'2人'};
  const portraits={naoki:'bear',maki:'rabbit',common:'common'};
  const node=(tag,text,cls)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  const dateLabel=value=>{const d=LifeCore.day(value);return d?Number(d.slice(5,7))+'/'+Number(d.slice(8,10)):'日付未確認';};
  function person(owner){owner=people[owner]?owner:'common';const wrap=node('span',undefined,'life-person');const image=node('img');image.src='assets/people/'+portraits[owner]+'.png';image.alt='';image.width=image.height=22;wrap.append(image,node('span',people[owner]));return wrap;}
  function notice(text){root.showToast(text);}
  async function request(action,extra){
    const res=await fetch(GAS_URL,{method:'POST',body:JSON.stringify(Object.assign({type:'web_app',action:action},extra||{}))});
    if(!res.ok)throw Error('読み込めませんでした');const data=await res.json();if(data.error||data.status==='error')throw Error('読み込めませんでした');return data;
  }
  let schedulePeriod='upcoming',scheduleEpoch=0;
  const scheduleStatus=node('p','読み込んでいます…','life-record-status');scheduleStatus.setAttribute('role','status');
  const scheduleList=$('schedule-ul');
  const scheduleHeading=node('h4','登録した予定','life-list-heading');
  const scheduleSwitch=node('div',undefined,'life-filter-tabs');scheduleSwitch.setAttribute('aria-label','予定の表示期間');
  for(const [value,text] of [['upcoming','これから・開催中'],['past','過去の予定']]){const b=node('button',text);b.type='button';b.dataset.period=value;b.setAttribute('aria-pressed',String(value===schedulePeriod));b.addEventListener('click',()=>{schedulePeriod=value;loadSchedules();});scheduleSwitch.append(b);}
  scheduleList.before(scheduleHeading,scheduleSwitch,scheduleStatus);
  async function loadSchedules(){
    const epoch=++scheduleEpoch;scheduleStatus.textContent='予定を読み込んでいます…';scheduleList.setAttribute('aria-busy','true');
    scheduleSwitch.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===schedulePeriod)));
    try{const data=await request('get_schedules',{period:schedulePeriod});if(epoch!==scheduleEpoch)return;scheduleList.replaceChildren();
      for(const event of data.items||[]){const li=node('li',undefined,'life-schedule-card'),copy=node('div');copy.append(node('strong',event.name));const range=dateLabel(event.startDate)+(LifeCore.day(event.endDate)&&LifeCore.day(event.endDate)!==LifeCore.day(event.startDate)?' 〜 '+dateLabel(event.endDate):'');copy.append(node('small',range));li.append(copy,person(event.owner));scheduleList.append(li);}
      scheduleStatus.textContent=(data.items||[]).length?((data.items||[]).length+'件の予定'):(schedulePeriod==='past'?'過去の予定はありません。':'これからの予定はありません。');
    }catch(e){if(epoch===scheduleEpoch)scheduleStatus.textContent='予定を読み込めませんでした。もう一度この画面を開いてください。';}
    finally{if(epoch===scheduleEpoch)scheduleList.setAttribute('aria-busy','false');}
  }
  let savingSchedule=false;
  async function submitEvent(){
    if(savingSchedule)return;const name=$('event-name').value.trim(),start=$('event-start-date').value,end=$('event-end-date').value;
    if(!name||!LifeCore.day(start))return notice('予定名と開始日を入力してください。');if(end&&end<start)return notice('終了日は開始日以降にしてください。');
    savingSchedule=true;$('btn-submit-event').disabled=true;
    try{await request('register_event',{name:name,startDate:start,endDate:end,owner:doc.querySelector('.owner-btn.active').dataset.owner});$('event-name').value='';schedulePeriod=(end||start)<LifeCore.day(new Date())?'past':'upcoming';await loadSchedules();notice('予定を登録しました。下の一覧で確認できます。');}
    catch(e){notice('登録できませんでした。入力を残しています。');}finally{savingSchedule=false;$('btn-submit-event').disabled=false;}
  }
  let menuEpoch=0,savingMenu=false;
  const history=$('menu-history');history.classList.add('life-menu-history');
  const jump=node('a','過去の献立を見る ↓','life-history-link');jump.href='#menu-history';doc.querySelector('#tab-menu .life-page-heading').after(jump);
  function drawMenuHistory(data){
    history.replaceChildren(node('h4','これまでの献立','life-list-heading'));
    const snapshots=data.history||[];if(!snapshots.length){history.append(node('p','保存した献立が、ここに週ごとに並びます。','life-record-status'));return;}
    history.append(node('p','週を開くと、月曜から日曜まで確認できます。','life-record-status'));
    for(const snapshot of snapshots){const details=node('details',undefined,'life-week-card'),summary=node('summary');const week=snapshot.week||LifeCore.weekStart(snapshot.date);const weeksAgo=week&&data.currentWeek?Math.round((Date.parse(data.currentWeek)-Date.parse(week))/604800000):null;const title=weeksAgo===1?'先週':weeksAgo===2?'先々週':dateLabel(week)+' の週';summary.append(node('strong',title),node('span',week?week.replace(/-/g,'/')+'〜':''));details.append(summary);
      if(snapshot.menu){const dl=node('dl',undefined,'life-week-days');days.forEach((d,i)=>{dl.append(node('dt',labels[i]),node('dd',snapshot.menu[d]||'未入力'));});details.append(dl);}else details.append(node('p',snapshot.menuStr||'この週の記録はありません。','life-record-status'));
      details.append(node('small','保存日 '+dateLabel(snapshot.date),'life-saved-date'));history.append(details);
    }
  }
  async function loadMenu(){const epoch=++menuEpoch;history.setAttribute('aria-busy','true');try{const data=await request('get_menu');if(epoch!==menuEpoch)return;days.forEach(d=>$('menu-'+d).value=(data.menu||{})[d]||'');drawMenuHistory(data);}catch(e){if(epoch===menuEpoch)history.replaceChildren(node('p','献立を読み込めませんでした。もう一度この画面を開いてください。','life-record-status'));}finally{if(epoch===menuEpoch)history.setAttribute('aria-busy','false');}}
  async function submitMenu(){if(savingMenu)return;savingMenu=true;const button=doc.querySelector('#tab-menu button[onclick="submitMenu()"]');button.disabled=true;try{const body={};days.forEach(d=>body[d]=$('menu-'+d).value);await request('register_menu',body);await loadMenu();notice('献立を保存しました。週ごとの履歴にも残ります。');}catch(e){notice('保存できませんでした。入力を残しています。');}finally{savingMenu=false;button.disabled=false;}}
  const galleries={};
  for(const [id,action,title] of [['photo-gallery','get_photos','登録した料理の写真'],['memory-gallery','get_memories','登録した思い出の写真']]){
    const gallery=$(id);gallery.classList.add('life-photo-grid');const status=node('p','','life-record-status');status.setAttribute('role','status');const more=node('button','前の写真を20枚表示','life-load-more');more.type='button';more.hidden=true;gallery.before(node('h4',title,'life-list-heading'),status);gallery.after(more);galleries[id]={id:id,action:action,items:[],cursor:null,query:'',epoch:0,busy:false,status:status,more:more};more.addEventListener('click',()=>loadGallery(id,true));
  }
  function safePhotoUrl(url){try{const parsed=new URL(url,doc.baseURI);return ['https:','http:'].includes(parsed.protocol)?parsed.href:'';}catch(e){return '';}}
  function photoCard(photo){const card=node('article',undefined,'photo-card'),url=safePhotoUrl(photo.url);if(url){const image=node('img');image.src=url;image.loading='lazy';image.decoding='async';image.alt=photo.memo||'登録した写真';image.className='photo-img';card.append(image);}const meta=node('div',undefined,'photo-meta');meta.append(node('time',LifeCore.day(photo.date)||'日付未確認','photo-date'),node('p',photo.memo||'メモなし','photo-memo'));card.append(meta);return card;}
  async function loadGallery(id,append){
    const state=galleries[id];if(append&&state.busy)return;
    if(!append){state.query=id==='photo-gallery'?$('photo-search').value.trim():'';state.cursor=null;state.items=[];state.epoch++;$(id).replaceChildren();}
    const epoch=state.epoch;state.busy=true;state.more.disabled=true;state.status.textContent='写真を読み込んでいます…';$(id).setAttribute('aria-busy','true');
    try{const data=await request(state.action,{limit:20,cursor:append?state.cursor:null,query:state.query});if(epoch!==state.epoch)return;
      const seen=new Set(state.items.map(p=>p.id||p.url+'|'+p.date));for(const p of data.items||[]){const key=p.id||p.url+'|'+p.date;if(seen.has(key))continue;seen.add(key);state.items.push(p);$(id).append(photoCard(p));}
      state.cursor=data.nextCursor;state.more.hidden=!(data.hasMore===true&&state.cursor);state.more.textContent='前の写真を20枚表示';state.status.textContent=state.items.length?(state.items.length+'枚を表示'+(Number.isFinite(data.total)?' / '+data.total+'枚':'')):(state.query?'一致する写真はありません。':'登録した写真はまだありません。');
    }catch(e){if(epoch===state.epoch){state.status.textContent='写真を読み込めませんでした。もう一度お試しください。';state.more.hidden=false;state.more.textContent='もう一度読み込む';}}
    finally{if(epoch===state.epoch){state.busy=false;state.more.disabled=false;$(id).setAttribute('aria-busy','false');}}
  }
  let searchTimer;function filterPhotos(){clearTimeout(searchTimer);galleries['photo-gallery'].epoch++;searchTimer=setTimeout(()=>loadGallery('photo-gallery',false),250);}
  function replaceOwnerEmoji(parent){
    if(!parent||!parent.querySelectorAll)return;const walker=doc.createTreeWalker(parent,NodeFilter.SHOW_TEXT);const textNodes=[];while(walker.nextNode()){const n=walker.currentNode;if(/[🐢🧸🏠]/u.test(n.textContent)&&!['SCRIPT','STYLE','TEXTAREA','OPTION'].includes(n.parentElement.tagName))textNodes.push(n);}
    textNodes.forEach(n=>{const parts=n.textContent.split(/(🐢|🧸|🏠)/u),fragment=doc.createDocumentFragment();parts.forEach(p=>{const owner={'🐢':'naoki','🧸':'maki','🏠':'common'}[p];if(owner){const image=node('img');image.className='life-person-icon';image.src='assets/people/'+portraits[owner]+'.png';image.alt='';image.width=image.height=24;fragment.append(image);}else fragment.append(doc.createTextNode(p));});n.replaceWith(fragment);});
  }
  const observer=new MutationObserver(mutations=>{for(const mutation of mutations)for(const added of mutation.addedNodes)replaceOwnerEmoji(added.nodeType===3?added.parentElement:added);});doc.querySelectorAll('.life-page').forEach(page=>observer.observe(page,{childList:true,subtree:true}));
  Object.assign(root,{loadSchedules:loadSchedules,submitEvent:submitEvent,loadMenu:loadMenu,submitMenu:submitMenu,loadPhotos:()=>loadGallery('photo-gallery',false),loadMemories:()=>loadGallery('memory-gallery',false),filterPhotos:filterPhotos});
})(window,document);
