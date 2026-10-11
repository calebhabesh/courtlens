// FO01 glance-test measurements for the shared filter bar and fields (frontend overhaul plan).
// Usage: node scripts/measure_fo01_glance.cjs > docs/evidence/fo01/glance.json   (dashboard on localhost:3100)
const {chromium}=require(require('path').join(__dirname,'../dashboard/node_modules/@playwright/test'));
(async()=>{const b=await chromium.launch({executablePath:require('fs').existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined});const out={};
for(const [vp,w,h] of [['desktop',1440,900],['phone',390,844]]){
 for(const r of ['/stats','/teams','/design','/roster-shapes','/wowy']){
  const p=await b.newPage({viewport:{width:w,height:h}});await p.goto('http://localhost:3100'+r);await p.waitForLoadState('networkidle').catch(()=>{});await p.waitForTimeout(1200);
  out[vp+' '+r]=await p.evaluate(()=>{const vis=e=>{const s=getComputedStyle(e);const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
   const bar=document.querySelector('.ui-filter-bar');
   const ctrls=bar?[...bar.querySelectorAll('.ui-select-wrapper,.ui-date-trigger,.ui-filter-bar-toggle,.ui-filter-bar-meta button')].filter(vis).map(e=>Math.round(e.getBoundingClientRect().height)):[];
   // label/control vertical center alignment in inline fields
   const misalign=bar?[...bar.querySelectorAll('.ui-field-inline')].filter(vis).map(f=>{const l=f.querySelector('.ui-field-label').getBoundingClientRect();const c=f.querySelector('.ui-field-control').getBoundingClientRect();return Math.abs((l.top+l.bottom)/2-(c.top+c.bottom)/2)}).filter(d=>d>2).length:null;
   // icon/text overlap in lookup and select fields
   const overlaps=[...document.querySelectorAll('.lookup-input-wrapper')].filter(vis).filter(w=>{const i=w.querySelector('.lookup-search-icon')?.getBoundingClientRect();const inp=w.querySelector('.lookup-input');if(!i||!inp)return false;const ib=inp.getBoundingClientRect();const pl=parseFloat(getComputedStyle(inp).paddingLeft);return i.right>ib.left+pl+0.5}).length;
   const selOverlap=[...document.querySelectorAll('.ui-select-wrapper')].filter(vis).filter(w=>{const s=w.querySelector('select');const c=w.querySelector('.ui-select-chevron').getBoundingClientRect();const sb=s.getBoundingClientRect();return sb.right-parseFloat(getComputedStyle(s).paddingRight)>c.left+0.5}).length;
   return {barControlHeights:[...new Set(ctrls)],labelMisaligned:misalign,lookupIconOverlaps:overlaps,selectChevronOverlaps:selOverlap,hOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,
     strictlyPrior:document.body.innerText.includes('Strictly prior')};});
  await p.close();}}
console.log(JSON.stringify(out,null,1));await b.close()})();
