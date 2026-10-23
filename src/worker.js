import { analyze, reopenHistorical } from "./engine.js";
import { DEFAULT_REQUEST } from "./router.js";
import { ENGINE_VERSION, VENUES } from "./constants.js";
import { persistRun } from "./store.js";

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const id=()=>crypto.randomUUID();
async function handle(request,env){
  const url=new URL(request.url);
  if(url.pathname==="/api/meta")return json({engineVersion:ENGINE_VERSION,chainId:1672,readOnly:true,unsignedOnly:true,broadcast:false,venues:VENUES,defaults:DEFAULT_REQUEST});
  if(url.pathname==="/api/runs"&&request.method==="GET"){const rows=await env.DB.prepare("SELECT payload FROM runs ORDER BY captured_at DESC LIMIT 30").all();return json({runs:rows.results.map(r=>reopenHistorical(JSON.parse(r.payload)))});}
  if(url.pathname.startsWith("/api/runs/")&&request.method==="GET"){const row=await env.DB.prepare("SELECT payload FROM runs WHERE id=?").bind(url.pathname.split("/").pop()).first();return row?json(reopenHistorical(JSON.parse(row.payload))):json({error:"Run not found."},404);}
  if(url.pathname==="/api/analyze"&&request.method==="POST"){
    const body=await request.json();const result=await analyze(body);const run={id:id(),requestKey:String(body.requestKey||id()),...result,historical:false};return json(await persistRun(env.DB,run,run.requestKey));
  }
  return env.ASSETS.fetch(request);
}
export default{async fetch(request,env){try{return await handle(request,env);}catch(error){return json({error:error.message,code:"AGGREGATION_FAILED",readOnly:true,unsignedOnly:true},500);}}};
