import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ENGINE_VERSION, MCP_ALLOWLIST, MCP_URL } from "./constants.js";

function parse(result,name){ const text=result.content?.find((x)=>x.type==="text")?.text; if(!text) throw new Error(`${name} returned no text.`); const value=JSON.parse(text); if(result.isError||value?.error) throw new Error(value?.error?.message||`${name} failed.`); return value; }
const retryable=(e)=>/timeout|fetch|network|429|502|503|reset|session|connection/i.test(e.message);
async function retry(fn,max=3){ let last; for(let i=1;i<=max;i+=1){ try{return await fn();}catch(e){last=e;if(i===max||!retryable(e))throw e;await new Promise(r=>setTimeout(r,250*i));}}throw last; }
export async function withPharosMcp(operation, options={}){
  let client,transport;
  for(let attempt=1;attempt<=3;attempt+=1){
    client=new Client({name:"pharos-multi-protocol-aggregator",version:ENGINE_VERSION});
    transport=new StreamableHTTPClientTransport(new URL(MCP_URL),{fetch:options.fetch||((input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)}))});
    try{await client.connect(transport);break;}catch(e){try{await client.close();}catch{} if(attempt===3||!retryable(e))throw e;}
  }
  try{
    const listed=(await client.listTools()).tools.map(x=>x.name); const missing=MCP_ALLOWLIST.filter(x=>!listed.includes(x)); if(missing.length)throw new Error(`Official MCP missing: ${missing.join(", ")}`);
    const call=(name,args={})=>{if(!MCP_ALLOWLIST.includes(name))throw new Error(`Tool ${name} is not allowed.`);return retry(async()=>parse(await client.callTool({name,arguments:args}),name));};
    return await operation({call,tools:MCP_ALLOWLIST});
  }finally{try{await transport.terminateSession();}catch{}try{await client.close();}catch{}}
}
