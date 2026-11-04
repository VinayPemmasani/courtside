const {chromium}=require('module').createRequire('/usr/lib/node_modules/')('playwright');
(async()=>{const b=await chromium.launch();
for(const [n,w,h] of [['cover',1920,1080],['mockups',2400,1500],['promo',1080,1080],['poster',1800,2400]]){
 const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:1});
 await p.goto('file://'+__dirname+'/'+n+'.html');await p.waitForTimeout(1500);
 await p.screenshot({path:__dirname+'/out/'+n+'.png'});await p.close();}
await b.close();})();
