import { DEFAULT_ACCOUNT, PLAN_TTL_SECONDS, USDC, VENUES } from "./constants.js";
import { assertAddress, formatUnits, parseUnits } from "./fixed.js";
import { MorphoVaultAdapter, decodePrepared } from "./adapters.js";

export function interpret(input={}){
  const request=String(input.request||"").trim(),q=request.toLowerCase();
  let intent=input.intent;
  if(!intent){ if(/withdraw|redeem|take out/.test(q))intent="withdraw"; else if(/deposit|supply|invest|where should/.test(q))intent="deposit"; else if(/rate|compare|yield/.test(q))intent="compare"; else if(/position|where are/.test(q))intent="positions"; }
  if(!["positions","compare","deposit","withdraw"].includes(intent)) return {status:"NEEDS_INPUT",missing:["supported intent"],reason:"Ask for positions, rate comparison, deposit preparation, or withdrawal preparation."};
  const account=input.account||request.match(/0x[0-9a-fA-F]{40}/)?.[0]; const receiver=input.receiver||account;
  const missing=[]; if(!account)missing.push("account"); if(["deposit","withdraw"].includes(intent)&&!input.amount)missing.push("amount"); if(["deposit","withdraw"].includes(intent)&&!receiver)missing.push("receiver");
  if(missing.length)return {status:"NEEDS_INPUT",intent,missing,reason:`Missing required parameter(s): ${missing.join(", ")}.`};
  return {status:"OK",intent,request,account:assertAddress(account),receiver:receiver?assertAddress(receiver,"receiver"):null,amount:input.amount?String(input.amount):null,asset:String(input.asset||"USDC").toUpperCase(),horizonDays:Number(input.horizonDays||30),objective:input.objective||"highest-net-value",minOutput:input.minOutput?String(input.minOutput):null,costs:input.costs||{}};
}

export function route(snapshot,interpreted){
  if(interpreted.status!=="OK")return {status:interpreted.status,interpreted,candidates:[],plan:null};
  const available=snapshot.venues.filter(v=>v.status==="AVAILABLE"); const failed=snapshot.venues.filter(v=>v.status!=="AVAILABLE");
  if(!available.length)return {status:"INSUFFICIENT_DATA",interpreted,candidates:snapshot.venues.map(v=>({venueId:v.id,eligible:false,reason:v.reason})),coverage:{available:0,total:snapshot.venues.length},plan:null};
  if(interpreted.intent==="positions"||interpreted.intent==="compare")return {status:failed.length?"PARTIAL":"COMPLETE",interpreted,candidates:available.map(v=>candidate(v,true,"Live pinned reads succeeded.")),coverage:{available:available.length,total:snapshot.venues.length,failed:failed.map(v=>v.id)},plan:null};
  if(interpreted.asset!==USDC.symbol)return {status:"BLOCKED",interpreted,candidates:available.map(v=>candidate(v,false,"Only verified USDC routes are supported.")),plan:null};
  const amountRaw=parseUnits(interpreted.amount,USDC.decimals); const candidates=available.map(v=>evaluate(v,interpreted,amountRaw)); const eligible=candidates.filter(c=>c.eligible);
  if(!eligible.length)return {status:"BLOCKED",interpreted,candidates,coverage:{available:available.length,total:snapshot.venues.length},plan:null};
  eligible.sort((a,b)=>BigInt(a.modeledScoreRaw)===BigInt(b.modeledScoreRaw)?a.venueId.localeCompare(b.venueId):(BigInt(a.modeledScoreRaw)>BigInt(b.modeledScoreRaw)?-1:1));
  const winner=eligible[0],venue=available.find(v=>v.id===winner.venueId),adapter=new MorphoVaultAdapter(VENUES.find(v=>v.id===winner.venueId));
  const prepared=interpreted.intent==="deposit"?adapter.prepareDeposit({account:interpreted.account,receiver:interpreted.receiver,amountRaw,venue}):adapter.prepareWithdraw({account:interpreted.account,receiver:interpreted.receiver,amountRaw,venue});
  for(const t of prepared.transactions){const decoded=decodePrepared(t); if(!decoded||!t.data.startsWith(t.kind==="APPROVE"?"0x095ea7b3":interpreted.intent==="deposit"?"0x6e553f65":"0xb460af94"))throw new Error("Calldata round-trip validation failed.");}
  const issuedAt=snapshot.block.timestamp,materialUnknown="Gas is denominated in PROS and no verified PROS/USDC conversion is used; Morpho V2 capacity/gates require execution-time validation.";
  return {status:prepared.approvalNeeded?"CONDITIONAL":"PREPARED",interpreted,candidates,coverage:{available:available.length,total:snapshot.venues.length,failed:failed.map(v=>v.id)},decision:{venueId:venue.id,venueName:venue.name,reason:`Selected the highest modeled final USDC value among ${eligible.length} eligible live candidate(s) for objective ${interpreted.objective}. ${failed.length?"Coverage is reduced by unavailable venues.":"All configured venues were observed."}`,limitations:[materialUnknown]},plan:{id:cryptoRandom(),status:prepared.approvalNeeded?"CONDITIONAL":"PREPARED",venueId:venue.id,venueName:venue.name,action:interpreted.intent,amountRaw:amountRaw.toString(),amountFormatted:formatUnits(amountRaw,USDC.decimals,USDC.decimals),asset:USDC,owner:interpreted.account,receiver:interpreted.receiver,approvalNeeded:prepared.approvalNeeded,transactions:prepared.transactions,quoteBlock:snapshot.block.number,quoteTimestamp:snapshot.block.timestamp,issuedAt,expiresAt:issuedAt+PLAN_TTL_SECONDS,freshnessSeconds:PLAN_TTL_SECONDS,preconditions:["Revalidate balance, allowance, capacity/gates, liquidity and gas immediately before signing.",materialUnknown],expectedPostconditions:interpreted.intent==="deposit"?["USDC decreases by the deposited assets.","Vault shares are minted to receiver."]:["Vault shares are burned from owner.","Exact USDC assets are sent to receiver."],executed:false}};
}

const cryptoRandom=()=>globalThis.crypto?.randomUUID?.()||`plan-${Date.now()}`;
const candidate=(v,eligible,reason)=>({venueId:v.id,name:v.name,status:v.status,eligible,reason,rate:v.rate});
function evaluate(v,i,amount){
  if(i.intent==="deposit"&&BigInt(v.account.usdcBalanceRaw)<amount)return {...candidate(v,false,"Insufficient verified USDC balance."),modeledScoreRaw:"0"};
  if(i.intent==="deposit"&&i.minOutput&&BigInt(v.quote.previewDepositSharesRaw)<parseUnits(i.minOutput,v.share.decimals))return {...candidate(v,false,"Live previewDeposit is below the requested minimum share output."),modeledScoreRaw:"0"};
  if(i.intent==="withdraw"){
    if(BigInt(v.position.sharesRaw)===0n)return {...candidate(v,false,"The account holds no shares in this venue."),modeledScoreRaw:"0"};
    if(BigInt(v.position.assetsRaw)<amount)return {...candidate(v,false,"Verified underlying exposure is below the requested withdrawal."),modeledScoreRaw:"0"};
  }
  const horizon=BigInt(Math.max(1,i.horizonDays)),gross=amount + amount*BigInt(v.rate.changePpm)*horizon/(1_000_000n*7n); const cost=BigInt(i.costs?.[v.id]||0); const score=gross-cost;
  return {...candidate(v,true,`Eligible from pinned balance/share reads. Score is projected from observed fixed-share change over the selected horizon minus disclosed USDC-denominated cost assumptions.`),modeledFinalRaw:score.toString(),modeledScoreRaw:score.toString(),costRaw:cost.toString(),observedNotGuaranteed:true};
}

export function isExpired(plan,nowSeconds=Math.floor(Date.now()/1000)){return nowSeconds>Number(plan.expiresAt);}
export const DEFAULT_REQUEST={request:"Where should I deposit 10 USDC?",intent:"deposit",account:DEFAULT_ACCOUNT,receiver:DEFAULT_ACCOUNT,amount:"10",asset:"USDC",horizonDays:30,objective:"highest-net-value"};
