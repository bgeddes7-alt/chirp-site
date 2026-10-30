// Chore chart widget, served as an MCP Apps UI resource (text/html;profile=mcp-app).
// Vanilla JS, no external loads, so the CSP stays empty.
export const WIDGET_URI = "ui://chirp/chore-chart-v5.html";

export const WIDGET_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#fff;--card:#f7f7fb;--ink:#1d1d2b;--mut:#6b6b80;--line:#e4e4ee;--brand:#5b5ef4;--brand2:#eeeefe;--ok:#1f9d6b;--okbg:#e6f6ef}
:root.dark{--bg:#212121;--card:#2a2a33;--ink:#f2f2f7;--mut:#a3a3b5;--line:#3a3a46;--brand:#8b8dff;--brand2:#30305a;--ok:#4fd19b;--okbg:#1d3a30}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.wrap{padding:14px}
.top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
h1{font-size:17px;margin:0}
.sub{color:var(--mut);font-size:12px;margin-top:2px}
.tabs{display:flex;gap:6px;overflow-x:auto;margin:10px 0 12px;padding-bottom:2px}
.tab{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer;white-space:nowrap}
.tab.on{background:var(--brand);border-color:var(--brand);color:#fff}
.goal{background:var(--card);border-radius:12px;padding:10px 12px;margin-bottom:10px}
.goalrow{display:flex;justify-content:space-between;font-size:13px}
.bar{height:8px;background:var(--line);border-radius:6px;margin-top:6px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--brand);width:0;transition:width .25s}
table{width:100%;border-collapse:collapse}
th{font-size:11px;color:var(--mut);font-weight:600;padding:4px 2px;text-align:center}
th:first-child{text-align:left}
td{border-top:1px solid var(--line);padding:6px 2px;text-align:center;vertical-align:middle}
td.name{text-align:left;padding-right:6px}
.cname{font-weight:600;cursor:pointer}
.cmeta{font-size:11px;color:var(--mut)}
.box{width:26px;height:26px;border-radius:8px;border:1.5px solid var(--line);background:transparent;cursor:pointer;font-size:14px;color:#fff;padding:0}
.box.done{background:var(--ok);border-color:var(--ok)}
.na{color:var(--line)}
.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.btn{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:8px 12px;font-size:13px;cursor:pointer}
.btn.primary{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}
.edit{background:var(--card);border-radius:12px;padding:10px;margin-top:10px;display:none}
.edit.show{display:block}
.edit label{display:block;font-size:12px;color:var(--mut);margin:6px 0 2px}
.edit input,.edit select{width:100%;padding:7px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font-size:14px}
.row2{display:flex;gap:8px}.row2>div{flex:1}
.note{font-size:12px;color:var(--mut);margin-top:10px}
.empty{color:var(--mut);padding:20px 0;text-align:center}
.toast{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:6px 12px;border-radius:8px;font-size:12px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.show{opacity:1}
</style></head><body>
<div class="wrap" id="app"><div class="empty">Building your chart...</div></div>
<div class="toast" id="toast"></div>
<script>
(function(){
var DAYS=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
var CHIRP_URL="https://www.chirp-kids.com/?utm_source=chatgpt&utm_medium=app&utm_campaign=chore_chart";
var state={chart:null,kid:0,checks:{},editing:null};
var pending={},nextId=1;

function rpc(method,params){var id=nextId++;try{window.parent.postMessage({jsonrpc:"2.0",id:id,method:method,params:params},"*")}catch(e){}
  return new Promise(function(res,rej){pending[id]={res:res,rej:rej};setTimeout(function(){if(pending[id]){delete pending[id];rej(new Error("timeout"))}},8000)})}
function notify(method,params){try{window.parent.postMessage({jsonrpc:"2.0",method:method,params:params},"*")}catch(e){}}
function toast(t){var el=document.getElementById("toast");el.textContent=t;el.classList.add("show");setTimeout(function(){el.classList.remove("show")},1800)}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c]})}

function applyTheme(t){if(!t)t=(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";document.documentElement.classList.toggle("dark",t==="dark")}

function daysFor(c){switch(c.schedule){case "daily":return [0,1,2,3,4,5,6];case "weekdays":return [0,1,2,3,4];case "weekends":return [5,6];case "weekly":return [Math.min(6,Math.max(0,(c.day||6)-1))];default:return null}}
function schedLabel(c){var d=daysFor(c);if(c.schedule==="daily")return "Every day";if(c.schedule==="weekdays")return "Weekdays";if(c.schedule==="weekends")return "Weekends";if(c.schedule==="weekly")return "Weekly, "+DAYS[d[0]];return "Anytime"}

function persist(){if(window.openai&&window.openai.setWidgetState){try{window.openai.setWidgetState({chart:state.chart,checks:state.checks,kid:state.kid,sig:lastSig})}catch(e){}}}
function tellModel(){var k=state.chart.kids[state.kid];if(!k)return;var e=earned(state.kid);
  rpc("ui/update-model-context",{content:[{type:"text",text:"Chore chart now: "+state.chart.kids.map(function(x){return x.name+" ("+x.chores.length+(x.chores.length===1?" chore)":" chores)")}).join(", ")+". "+k.name+" has earned "+e+" min this week in the chart."}]}).catch(function(){})}

function key(ki,ci,d){return ki+"|"+ci+"|"+d}
function earned(ki){var k=state.chart.kids[ki],t=0;k.chores.forEach(function(c,ci){for(var d=0;d<7;d++)if(state.checks[key(ki,ci,d)])t+=c.minutes});return t}
function possible(ki){var k=state.chart.kids[ki],t=0;k.chores.forEach(function(c){var d=daysFor(c);t+=c.minutes*(d?d.length:1)});return t}

function render(){
  var app=document.getElementById("app"),ch=state.chart;
  if(!ch||!ch.kids||!ch.kids.length){app.innerHTML='<div class="empty">No chores yet. Tell me what you want help with.</div>';size();return}
  if(state.kid>=ch.kids.length)state.kid=0;
  var k=ch.kids[state.kid],h="";
  h+='<div class="top"><div><h1>'+esc(ch.title||"Family Chore Chart")+'</h1><div class="sub">Rewards are minutes of screen time or anything you choose</div></div></div>';
  if(ch.kids.length>1){h+='<div class="tabs">';ch.kids.forEach(function(x,i){h+='<button class="tab'+(i===state.kid?" on":"")+'" data-kid="'+i+'">'+esc(x.emoji||"")+" "+esc(x.name)+'</button>'});h+='</div>'}
  var e=earned(state.kid),p=possible(state.kid),pct=p?Math.min(100,Math.round(e/p*100)):0;
  h+='<div class="goal kidsheet"><div class="goalrow"><b>'+esc(k.emoji||"")+" "+esc(k.name)+'</b><span>'+e+' / '+p+' min this week</span></div><div class="bar"><i style="width:'+pct+'%"></i></div></div>';
  if(!k.chores.length){h+='<div class="empty">No chores for '+esc(k.name)+' yet.</div>'}else{
  h+='<table><thead><tr><th>Chore</th>';DAYS.forEach(function(d){h+='<th>'+d.charAt(0)+'</th>'});h+='</tr></thead><tbody>';
  k.chores.forEach(function(c,ci){var dl=daysFor(c);
    h+='<tr><td class="name"><div class="cname" data-edit="'+ci+'">'+esc(c.emoji||"")+" "+esc(c.name)+'</div><div class="cmeta">'+c.minutes+' min · '+schedLabel(c)+'</div></td>';
    for(var d=0;d<7;d++){var on=dl?dl.indexOf(d)>-1:true;var done=!!state.checks[key(state.kid,ci,d)];
      h+=on?'<td><button class="box'+(done?" done":"")+'" aria-label="'+esc(c.name)+" "+DAYS[d]+'" data-ci="'+ci+'" data-d="'+d+'">'+(done?"✓":"")+'</button></td>':'<td class="na">·</td>'}
    h+='</tr>'});
  h+='</tbody></table>'}
  h+='<div class="edit" id="edit"></div>';
  h+='<div class="actions"><button class="btn" id="add">+ Add chore</button><button class="btn primary" id="chirp">Open the Chirp app</button></div>';
  h+='<div class="note">Tap a chore to edit it. Chirp turns this chart into an app your kids check off themselves, and you approve.</div>';
  app.innerHTML=h;bind();if(state.editing!=null)openEdit(state.editing);size();
}

function bind(){
  document.querySelectorAll("[data-kid]").forEach(function(b){b.onclick=function(){state.kid=+b.dataset.kid;state.editing=null;persist();render()}});
  document.querySelectorAll(".box").forEach(function(b){b.onclick=function(){var k=key(state.kid,+b.dataset.ci,+b.dataset.d);if(state.checks[k])delete state.checks[k];else state.checks[k]=1;persist();render()}});
  document.querySelectorAll("[data-edit]").forEach(function(b){b.onclick=function(){state.editing=+b.dataset.edit;render()}});
  document.getElementById("add").onclick=function(){var k=state.chart.kids[state.kid];k.chores.push({name:"New chore",emoji:"⭐",minutes:15,schedule:"daily"});state.editing=k.chores.length-1;persist();render()};
  document.getElementById("chirp").onclick=openChirp;
}

function openEdit(ci){var k=state.chart.kids[state.kid],c=k.chores[ci];if(!c)return;var el=document.getElementById("edit");el.classList.add("show");
  el.innerHTML='<label>Chore</label><input id="en" maxlength="100" value="'+esc(c.name)+'"><div class="row2"><div><label>Minutes earned</label><input id="em" type="number" min="1" max="480" value="'+c.minutes+'"></div><div><label>How often</label><select id="es">'+
  ["daily","weekdays","weekends","weekly","none"].map(function(s){return '<option value="'+s+'"'+(c.schedule===s?" selected":"")+'>'+schedLabel({schedule:s,day:c.day})+'</option>'}).join("")+
  '</select></div></div><div class="actions"><button class="btn primary" id="esave">Save</button><button class="btn" id="edel">Remove</button><button class="btn" id="ecan">Cancel</button></div>';
  document.getElementById("esave").onclick=function(){var n=document.getElementById("en").value.trim();var m=parseInt(document.getElementById("em").value,10);
    if(n)c.name=n.slice(0,100);if(m>0)c.minutes=Math.min(480,m);c.schedule=document.getElementById("es").value;state.editing=null;persist();tellModel();render()};
  document.getElementById("edel").onclick=function(){k.chores.splice(ci,1);var nc={};Object.keys(state.checks).forEach(function(x){var p=x.split("|");if(+p[0]!==state.kid){nc[x]=1;return}var i=+p[1];if(i<ci)nc[x]=1;else if(i>ci)nc[p[0]+"|"+(i-1)+"|"+p[2]]=1});state.checks=nc;state.editing=null;persist();tellModel();render()};
  document.getElementById("ecan").onclick=function(){state.editing=null;render()};
}

function openChirp(){
  rpc("ui/open-link",{url:CHIRP_URL}).catch(function(){
    if(window.openai&&window.openai.openExternal){try{window.openai.openExternal({href:CHIRP_URL});return}catch(e){}}
    toast("Search Chirp in the App Store");
  });
}

function size(){var b=document.documentElement;notify("ui/notifications/size-changed",{width:b.scrollWidth,height:b.scrollHeight})}
if(window.ResizeObserver)new ResizeObserver(size).observe(document.body);

function normalize(sc){if(!sc||!Array.isArray(sc.kids))return null;return{title:sc.title,kids:sc.kids.map(function(k,i){return{name:String(k.label||k.name||("Kid "+(i+1))),emoji:k.emoji||"",chores:(k.chores||[]).map(function(c){return{name:String(c.name||"Chore"),emoji:c.emoji||"",minutes:Math.max(1,Math.min(480,parseInt(c.minutes,10)||15)),schedule:c.schedule||"daily",day:c.day}})}})}}
var lastSig=null;
function load(sc){var ch=normalize(sc);if(!ch)return;var sig=JSON.stringify(ch);
  if(sig===lastSig)return; // host re-sent the same result: keep the parent's edits and check-offs
  var first=lastSig===null;lastSig=sig;
  var ws=window.openai&&window.openai.widgetState;
  if(first&&ws&&ws.chart&&ws.chart.kids&&ws.chart.kids.length&&ws.sig===sig){state.chart=ws.chart;state.checks=ws.checks||{};state.kid=ws.kid||0}
  else{state.chart=ch;state.checks={};state.kid=0;state.editing=null}
  render()}

window.addEventListener("message",function(ev){if(ev.source!==window.parent)return;var m=ev.data;if(!m||m.jsonrpc!=="2.0")return;
  if(m.id!==undefined&&pending[m.id]&&!m.method){var p=pending[m.id];delete pending[m.id];m.error?p.rej(m.error):p.res(m.result);return}
  if(m.method==="ui/notifications/tool-result"){load(m.params&&m.params.structuredContent)}
  else if(m.method==="ui/notifications/host-context-changed"){if(m.params&&m.params.theme)applyTheme(m.params.theme)}
  else if(m.method==="ui/resource-teardown"&&m.id!==undefined){persist();try{window.parent.postMessage({jsonrpc:"2.0",id:m.id,result:{}},"*")}catch(e){}}
},{passive:true});

applyTheme(window.openai&&window.openai.theme);
rpc("ui/initialize",{protocolVersion:"2026-01-26",appInfo:{name:"Chirp Chore Chart",version:"1.0.2"},appCapabilities:{availableDisplayModes:["inline","fullscreen"]}})
  .then(function(r){if(r&&r.hostContext&&r.hostContext.theme)applyTheme(r.hostContext.theme);notify("ui/notifications/initialized",{})})
  .catch(function(){});
// Compatibility path: hosts that expose window.openai.toolOutput directly.
var tries=0;(function poll(){if(state.chart)return;var o=window.openai&&window.openai.toolOutput;if(o&&o.kids){load(o);return}if(tries++<40)setTimeout(poll,150)})();
window.addEventListener("openai:set_globals",function(){var o=window.openai&&window.openai.toolOutput;if(o&&o.kids)load(o);if(window.openai&&window.openai.theme)applyTheme(window.openai.theme)});
})();
</script></body></html>`;
