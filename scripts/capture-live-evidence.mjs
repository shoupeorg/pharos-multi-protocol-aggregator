import { mkdir, writeFile } from "node:fs/promises";
import { analyze } from "../src/engine.js";
import { DEFAULT_ACCOUNT, WITHDRAWAL_EXAMPLE } from "../src/constants.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const cases=[
  ["live-query",{request:"Where are my supported positions?",intent:"positions",account:DEFAULT_ACCOUNT}],
  ["live-deposit",{request:"Where should I deposit 10 USDC?",intent:"deposit",account:DEFAULT_ACCOUNT,receiver:DEFAULT_ACCOUNT,amount:"10",asset:"USDC",horizonDays:30,objective:"highest-net-value"}],
  ["live-withdrawal",{request:"Prepare a 1 USDC withdrawal from an eligible position",intent:"withdraw",account:WITHDRAWAL_EXAMPLE,receiver:WITHDRAWAL_EXAMPLE,amount:"1",asset:"USDC",objective:"immediacy"}],
  ["live-outage",{request:"Where are my supported positions during the labeled outage demo?",intent:"positions",account:DEFAULT_ACCOUNT,outageVenue:"morpho-rockawayx"}]
];
const serverEntry=process.env.PHAROS_MCP_SERVER_ENTRY||fileURLToPath(new URL("../../official-pharos-mcp/dist/src/index.js",import.meta.url));
const transport=new StdioClientTransport({command:process.execPath,args:[serverEntry],env:{...process.env,PHAROS_RPC_URL:"https://rpc.pharos.xyz",PHAROS_CHAIN_ID:"1672",PHAROS_NATIVE_SYMBOL:"PROS",ENABLE_SEND_RAW_TRANSACTION:"false"},stderr:"pipe"});
const client=new Client({name:"pharos-multi-protocol-evidence",version:"1.0.0"});
const parse=(response,name)=>{const text=response.content?.find(x=>x.type==="text")?.text;if(!text)throw new Error(`${name} returned no text.`);const value=JSON.parse(text);if(response.isError||value?.error)throw new Error(value?.error?.message||`${name} failed.`);return value;};
await client.connect(transport);
const listed=(await client.listTools()).tools.map(x=>x.name);
const mcp={tools:listed,call:async(name,args={})=>parse(await client.callTool({name,arguments:args}),name)};
await mkdir(new URL("../evidence/",import.meta.url),{recursive:true});await mkdir(new URL("../public/evidence/",import.meta.url),{recursive:true});
const runs=[];
try{for(const [name,input] of cases){
  const run=await analyze(input,{mcp});
  if(name==="live-query"&&run.snapshot.venues.filter(v=>v.status==="AVAILABLE").length!==2)throw new Error(`Live query did not retain two available venues: ${JSON.stringify(run.snapshot.venues.map(v=>({id:v.id,status:v.status,reason:v.reason})))}`);
  if(name==="live-deposit"&&!run.routing.plan?.transactions?.some(t=>t.kind==="DEPOSIT"))throw new Error("Live deposit evidence has no deposit calldata.");
  if(name==="live-withdrawal"&&!run.routing.plan?.transactions?.some(t=>t.kind==="WITHDRAW"))throw new Error("Live withdrawal evidence has no position-backed withdrawal calldata.");
  if(name==="live-outage"&&!(run.snapshot.venues.some(v=>v.status==="UNAVAILABLE")&&run.snapshot.venues.some(v=>v.status==="AVAILABLE")))throw new Error("Outage isolation evidence failed.");
  const text=JSON.stringify({...run,evidenceName:name,historical:true},null,2);await writeFile(new URL(`../evidence/${name}.json`,import.meta.url),text);await writeFile(new URL(`../public/evidence/${name}.json`,import.meta.url),text);
  runs.push({name,file:`${name}.json`,status:run.routing.status,capturedAt:run.capturedAt,block:run.snapshot?.block?.number,available:run.snapshot?.venues?.filter(v=>v.status==="AVAILABLE").length,planStatus:run.routing.plan?.status||null,transactions:run.routing.plan?.transactions?.length||0});
}}finally{await client.close();}
const manifest={evidenceVersion:"1.0",engineVersion:"multi-protocol-aggregator/1.0.0",capturedAt:new Date().toISOString(),readOnly:true,unsignedOnly:true,executed:false,runs};
const text=JSON.stringify(manifest,null,2);await writeFile(new URL("../evidence/manifest.json",import.meta.url),text);await writeFile(new URL("../public/evidence/manifest.json",import.meta.url),text);console.log(JSON.stringify(manifest,null,2));
