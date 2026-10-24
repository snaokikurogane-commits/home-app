/* Presentation helpers only. No ledger, credentials, storage, or API calls. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HHVisuals=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function chartData(categories){
  const positive=categories.filter(c=>c.amount>0),negative=categories.filter(c=>c.amount<0);
  const positiveTotal=positive.reduce((n,c)=>n+c.amount,0),negativeTotal=negative.reduce((n,c)=>n+c.amount,0);let start=0;
  return{positiveTotal,negativeTotal,net:positiveTotal+negativeTotal,negative,zero:categories.filter(c=>c.amount===0),slices:positive.map(c=>{const slice={name:c.name,amount:c.amount,fraction:c.amount/positiveTotal,start};start+=slice.fraction;return slice;})};
 }
 function categoryColor(name){const colors={'家賃':'#829e78','食費':'#df9885','日用雑貨':'#88a9b7','外食':'#d3b37b','水道代':'#8bb9bf','電気代':'#c4a66b','通信費':'#a493ac','交通費':'#a4ad7b','娯楽':'#c69788'};if(colors[name])return colors[name];let hash=0;for(const c of name)hash=(hash*31+c.codePointAt(0))>>>0;return['#829e78','#df9885','#88a9b7','#c4a66b','#a493ac','#9e8973'][hash%6];}
 function createMotion(options){
  let played=false,active=false,reduced=!!options.reduced,timer=null;
  function clear(){if(timer!==null)options.cancel(timer);timer=null;}
  function stop(){clear();if(active){active=false;options.still();}}
  return{enter(){if(played)return;played=true;if(reduced)return;active=true;timer=options.schedule(stop,5000);options.animated();},loaded(){if(active){clear();timer=options.schedule(stop,2448);}},leave:stop,reduce(value){reduced=value;if(value)stop();}};
 }
 function reduced(){return document.documentElement.classList.contains('reduce-motion')||window.matchMedia('(prefers-reduced-motion: reduce)').matches;}
 function enhanceDisclosure(details,content){
  let closing=false;const summary=details.querySelector('summary');
  function close(focus=false){
   if(closing)return;
   const finish=()=>{details.open=false;content.style.overflow='';closing=false;if(focus)summary.focus();};
   if(!details.open||reduced()||!content.animate){finish();return;}
   closing=true;content.style.overflow='hidden';
   const animation=content.animate([{opacity:1,height:content.offsetHeight+'px'},{opacity:0,height:'0px'}],{duration:180,easing:'ease-in',fill:'forwards'});
   animation.finished.then(()=>{finish();animation.cancel();},finish);
  }
  summary.addEventListener('click',event=>{if(details.open){event.preventDefault();close();}});
  return close;
 }
 function recordMotion(image){
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion=createMotion({reduced:reduced(),animated:()=>image.src='assets/illustrations/rabbit-wave.webp',still:()=>image.src='assets/illustrations/rabbit-still.webp',schedule:(fn,ms)=>setTimeout(fn,ms),cancel:timer=>clearTimeout(timer)});
  image.addEventListener('load',()=>{if(image.getAttribute('src')==='assets/illustrations/rabbit-wave.webp')motion.loaded();});
  image.addEventListener('error',motion.leave);document.addEventListener('visibilitychange',()=>{if(document.hidden)motion.leave();});
  preference.addEventListener('change',()=>motion.reduce(reduced()));
  if('IntersectionObserver'in window)new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)motion.leave();}).observe(image);
  return motion;
 }
 return{chartData,categoryColor,createMotion,reduced,enhanceDisclosure,recordMotion};
});
