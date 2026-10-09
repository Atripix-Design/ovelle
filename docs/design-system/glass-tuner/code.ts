async function createMaterialEngine(){

const allVariables=await figma.variables.getLocalVariablesAsync();
const allCollections=await figma.variables.getLocalVariableCollectionsAsync();
const variables=new Map(allVariables.map(v=>[v.id,v]));
const collections=new Map(allCollections.map(c=>[c.id,c]));
const derived=new Map(allVariables.map(v=>[v.variableCollectionId+'|'+v.name,v]));
const createdVariableIds=[];
function resolveColor(v:Variable,modeId:string,modeName:string,fallback:RGB):RGB{
 for(let depth=0;depth<12;depth++){
  const c=collections.get(v.variableCollectionId);
  const id=v.valuesByMode[modeId]!==undefined?modeId:c?.modes.find(m=>m.name===modeName)?.modeId||c?.defaultModeId||Object.keys(v.valuesByMode)[0];
  const value=v.valuesByMode[id]??Object.values(v.valuesByMode)[0];
  if(value&&typeof value==='object'&&'r'in value)return {r:value.r,g:value.g,b:value.b};
  if(value&&typeof value==='object'&&'type'in value&&value.type==='VARIABLE_ALIAS'){const next=variables.get(value.id);if(!next)break;v=next;}else break;
 }
 return fallback;
}
const linear=(c:number)=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
function tintOpacity(color:RGB,t:number,tiny:boolean,menu:boolean):number{
 const lum=.2126*linear(color.r)+.7152*linear(color.g)+.0722*linear(color.b);
 if(tiny)return 1;
 const min=lum<.25?.92:menu?.88:.62;
 return min+(.96-min)*t;
}
async function tuneSurface(n:Surface,base:Baseline,value:number,reduceTransparency=false,scope='library'){
 const t=Math.max(0,Math.min(100,value))/100;
 const tiny=n.width<=60&&n.height<=40,menu=/Options|Popover|Menu panel/.test(n.name);
 n.effects=base.effects.map(e=>e.type==='GLASS'?{...e,visible:e.visible&&!reduceTransparency,refraction:e.refraction*(1-.8*t),dispersion:e.dispersion*Math.pow(1-t,2),depth:e.depth*(1-.5*t),lightIntensity:e.lightIntensity*(1-.25*t),radius:tiny?2+4*t:menu?8+24*t:(e.depth>=12?40:24)*t}:e);
 const paints:Paint[]=[];
 for(const paint of base.fills){
  if(paint.type==='SOLID'){
   let source=variables.get(paint.boundVariables?.color?.id||'');
   const sourceId=source?.description.match(/^ovelle-glass-source:(\S+)/)?.[1];
   if(sourceId)source=variables.get(sourceId);
   if(source){
    const collection=collections.get(source.variableCollectionId);if(!collection)throw new Error('Source color collection unavailable.');
    const name='glass/derived/'+scope+'/'+source.id.replace(/:/g,'-')+'/'+(tiny?'micro':menu?'menu':'surface');
    const key=collection.id+'|'+name;
    let tint=derived.get(key);
    if(!tint){tint=figma.variables.createVariable(name,collection,'COLOR');tint.scopes=['FRAME_FILL','SHAPE_FILL'];tint.description='ovelle-glass-source:'+source.id+'\nAlpha resolves the opaque source color variable so native glass samples backgrounds.';tint.setVariableCodeSyntax('WEB','var(--ovelle-'+name.replace(/[^a-zA-Z0-9-]/g,'-').toLowerCase()+')');derived.set(key,tint);variables.set(tint.id,tint);createdVariableIds.push(tint.id);}
    for(const mode of collection.modes){const color=resolveColor(source,mode.modeId,mode.name,paint.color);tint.setValueForMode(mode.modeId,{...color,a:reduceTransparency?1:tintOpacity(color,t,tiny,menu)});}
    paints.push(figma.variables.setBoundVariableForPaint({...paint,opacity:1},'color',tint));
   }else paints.push({...paint,boundVariables:{},opacity:reduceTransparency?1:tintOpacity(paint.color,t,tiny,menu)});
  }else if(paint.type.startsWith('GRADIENT'))paints.push({...paint,opacity:reduceTransparency?0:Math.min(1,Math.max(0,(paint.opacity??1)*(1-.4*t)))});
  else paints.push(paint);
 }
 n.fills=paints;
}

return {tuneSurface,variables,collections};
}

const COMMAND='920068c6-0076-4fa4-94bf-67f7325bb96f';
const KEY='ovelle-glass-baseline-v1';
type Message={type:string;intensity?:number;scope?:string;height?:number;enabled?:boolean;source?:string;reduceTransparency?:boolean};
type Baseline={effects:Effect[];fills:Paint[]};
type Surface=SceneNode & {effects:readonly Effect[];fills:readonly Paint[]|typeof figma.mixed};
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const session=new Map<string,Baseline>();
let pending:Message|null=null,running:Promise<void>|null=null,followVariable=false,polling=false,lastVariableKey:string|null=null;
figma.showUI(__html__,{width:320,height:460});
figma.root.setRelaunchData({[COMMAND]:'Tune glass intensity'});
function baseline(n:Surface,currentValue:number,currentReduced:boolean,variables:Map<string,Variable>):Baseline|null{
 if(session.has(n.id))return session.get(n.id)!;
 let saved:Baseline|null=null;
 try{const raw=n.getPluginData(KEY);if(raw)saved=JSON.parse(raw);}catch{}
 if(!saved&&n.effects.some(e=>e.type==='GLASS')&&n.fills!==figma.mixed){
  
  const t=currentValue/100;
  const alreadyTuned=[...n.fills].some(p=>p.type==='SOLID'&&variables.get(p.boundVariables?.color?.id||'')?.name.startsWith('glass/derived/'));
  const tiny=n.width<=60&&n.height<=40;
  const effects=clone([...n.effects]).map(e=>{
   if(e.type!=='GLASS'||!alreadyTuned)return e;
   const depth=e.depth/(1-.5*t);
   return {...e,visible:currentReduced?true:e.visible,refraction:e.refraction/(1-.8*t),dispersion:t===1?(tiny?0:depth>=12?.04:.08):e.dispersion/Math.pow(1-t,2),depth,lightIntensity:e.lightIntensity/(1-.25*t)};
  });
  const fills=clone([...n.fills]).map(p=>alreadyTuned&&p.type.startsWith('GRADIENT')?{...p,opacity:currentReduced?1:Math.min(1,Math.max(0,(p.opacity??1)/(1-.4*t)))}:p);
  saved={effects,fills};
  n.setPluginData(KEY,JSON.stringify(saved));
 }
 if(saved)session.set(n.id,saved);
 return saved;
}
function reportStatus(text:string){figma.ui.postMessage({type:'status',text});}
async function setting(){
 const collections=await figma.variables.getLocalVariableCollectionsAsync();
 const collection=collections.find(c=>c.name==='Ovelle / Material settings');
 if(!collection)return null;
 const vars=await figma.variables.getLocalVariablesAsync();
 const variable=vars.find(v=>v.variableCollectionId===collection.id&&v.name==='glass/intensity');
 const reduce=vars.find(v=>v.variableCollectionId===collection.id&&v.name==='accessibility/reduce-transparency');
 return variable?{collection,variable,reduce}:null;
}
async function apply(m:Message){
 const number=Number(m.intensity);
 if(!Number.isFinite(number)||number<0||number>100){reportStatus('Enter a number between 0 and 100.');return;}
 const scope=m.scope==='Library'?'Library':'Selection';
 const reduceTransparency=m.reduceTransparency===true;
 try{
 let roots:readonly SceneNode[];
 if(scope==='Library'){
  const page=figma.root.children.find(p=>p.name==='05 Components');
  if(!page)throw new Error('The Ovelle Components page was not found.');
  await page.loadAsync();roots=page.children;
 }else{
  roots=figma.currentPage.selection;
  if(!roots.length)throw new Error('Select a glass component or frame first.');
 }
 const engine=await createMaterialEngine();
 const prior=await setting();
 const raw=prior?.variable.valuesByMode[prior.collection.defaultModeId];
 const currentValue=typeof raw==='number'?Math.max(0,Math.min(100,raw)):35;
 const currentReduced=prior?.reduce?.valuesByMode[prior.collection.defaultModeId]===true;
 const seen=new Set<string>(),targets:{n:Surface;b:Baseline}[]=[];
 let visited=0;
 const stack:SceneNode[]=[...roots];
 while(stack.length){
  const node=stack.pop()!;
  if(seen.has(node.id))continue;seen.add(node.id);
  if(++visited>30000)throw new Error('Selection is too large. Select fewer components.');
  if('effects'in node&&'fills'in node){
   const n=node as Surface;
   if(n.effects.some(e=>e.type==='GLASS')||n.getPluginData(KEY)){
    const b=baseline(n,currentValue,currentReduced,engine.variables);if(b)targets.push({n,b});
   }
  }
  if('children'in node)stack.push(...node.children);
 }
 if(!targets.length)throw new Error('No glass surfaces found. Choose Liquid Glass on the component first.');
 const t=number/100;
 for(const {n,b} of targets)await engine.tuneSurface(n,b,number,reduceTransparency,scope==='Library'?'library':'selection-'+n.id.replace(/[^a-zA-Z0-9-]/g,'-'));
 for(const root of roots)root.setRelaunchData({[COMMAND]:'Tune glass intensity'});
 if(scope==='Library'){
  const s=await setting();
  if(s){lastVariableKey=number+':'+reduceTransparency;s.variable.setValueForMode(s.collection.defaultModeId,number);if(s.reduce)s.reduce.setValueForMode(s.collection.defaultModeId,reduceTransparency);}
 }
 figma.commitUndo();
 reportStatus('Applied frost '+number+'% to '+targets.length+' glass surfaces. Undo is available.');
 figma.ui.postMessage({type:'config',source:m.source||'panel',config:{schemaVersion:2,glassFrost:number,normalizedFrost:t,reduceTransparency}});
 }catch(e){reportStatus(e instanceof Error?e.message:String(e));}
}
function request(m:Message):Promise<void>{
 pending=m;
 if(running)return running;
 const task=(async()=>{try{while(pending){const next=pending;pending=null;await apply(next);}}finally{running=null;figma.ui.postMessage({type:'ready'});}})();
 running=task;
 return task;
}
async function pollVariable(){
 if(!followVariable||polling)return;
 polling=true;
 try{
  const s=await setting();if(!s){reportStatus('glass/intensity was not found in this file.');return;}
  const value=s.variable.valuesByMode[s.collection.defaultModeId];
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100){reportStatus('Set glass/intensity to a number between 0 and 100.');return;}
  const reduceTransparency=s.reduce?.valuesByMode[s.collection.defaultModeId]===true;
  const key=value+':'+reduceTransparency;
  if(key!==lastVariableKey){
   lastVariableKey=key;
   await request({type:'apply',intensity:value,scope:'Library',source:'variable',reduceTransparency});
  }
 }catch(e){reportStatus(e instanceof Error?e.message:String(e));}
 finally{polling=false;}
}
figma.ui.onmessage=async(m:Message)=>{
 if(m.type==='resize'){figma.ui.resize(320,Math.max(200,Math.min(780,m.height||460)));return;}
 if(m.type==='apply')return request(m);
 if(m.type==='follow'){
  followVariable=m.enabled===true;
  if(followVariable){lastVariableKey=null;await pollVariable();}
  else reportStatus('Variable following paused.');
 }
 if(m.type==='initialize'){
  const s=await setting();
  if(s){
   const value=s.variable.valuesByMode[s.collection.defaultModeId];
   if(typeof value==='number'&&value>=0&&value<=100)figma.ui.postMessage({type:'initial-value',value,reduceTransparency:s.reduce?.valuesByMode[s.collection.defaultModeId]===true});
  }
 }
};
setInterval(()=>{void pollVariable();},650);

