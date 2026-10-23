import test from "node:test";
import assert from "node:assert/strict";
import { analyze, reopenHistorical } from "../src/engine.js";
import { decodePrepared, readLiveVenues } from "../src/adapters.js";
import { interpret, isExpired, route } from "../src/router.js";
import { CHAIN_ID, MCP_ALLOWLIST, SELECTORS, USDC, VENUES } from "../src/constants.js";
import { addressWord, word } from "../src/fixed.js";

const ACCOUNT="0x1111111111111111111111111111111111111111", RECEIVER="0x2222222222222222222222222222222222222222";
const result=(hex)=>({result:hex}), uint=(n)=>`0x${word(n)}`, addr=(a)=>`0x${addressWord(a)}`;
function mockMcp(options={}){
  const calls=[];
  const venueData={
    [VENUES[0].address.toLowerCase()]:{shares:2n*10n**18n,now:2_000_000n,start:1_900_000n,total:11_000_000n,supply:10n**19n},
    [VENUES[1].address.toLowerCase()]:{shares:1n*10n**18n,now:1_500_000n,start:1_470_000n,total:4_000_000n,supply:3n*10n**18n}
  };
  const call=async(name,args={})=>{
    calls.push({name,args});
    if(name==="get_chain_info")return {chainId:CHAIN_ID};
    if(name==="get_block_number")return {blockNumber:"200000"};
    if(name==="get_block")return {timestamp:String(args.block===100000?900:1000),hash:`0x${"ab".repeat(32)}`};
    if(name==="get_code"){
      if(options.failVenue&&args.address.toLowerCase()===options.failVenue.toLowerCase())throw new Error("injected timeout");
      return {code:"0x60016000"};
    }
    if(name==="get_gas_price")return {gasPriceWei:"10000000000",gasPriceGwei:"10"};
    if(name==="estimate_gas"){if(options.failEstimate)throw new Error("execution reverted");return {gas:"75000"};}
    if(name!=="eth_call")throw new Error(`Unexpected ${name}`);
    const to=args.transaction.to.toLowerCase(),data=args.transaction.data,selector=data.slice(0,10),venue=venueData[to];
    if(selector===SELECTORS.asset)return result(addr(USDC.address));
    if(selector===SELECTORS.decimals)return result(uint(to===USDC.address.toLowerCase()?6:18));
    if(selector===SELECTORS.totalAssets)return result(uint(venue.total));
    if(selector===SELECTORS.totalSupply)return result(uint(venue.supply));
    if(selector===SELECTORS.allowance)return result(uint(options.allowance??0));
    if(selector===SELECTORS.balanceOf){
      const who=`0x${data.slice(-40)}`.toLowerCase();
      if(to===USDC.address.toLowerCase())return result(uint(options.usdcBalance??100_000_000n));
      if(who.endsWith("dead".padStart(40,"0")))return result(uint(10n**18n));
      return result(uint(venue.shares));
    }
    if(selector===SELECTORS.convertToAssets){const raw=args.block===100000?venue.start:venue.now; const quantity=BigInt(`0x${data.slice(-64)}`);return result(uint(raw*quantity/10n**18n));}
    if(selector===SELECTORS.previewDeposit||selector===SELECTORS.previewWithdraw){const assets=BigInt(`0x${data.slice(-64)}`);return result(uint(assets*10n**18n/venue.now));}
    throw new Error(`Unexpected selector ${selector}`);
  };
  return {call,tools:MCP_ALLOWLIST,calls};
}

test("both real adapter interfaces use pinned injected responses and exact conversion",async()=>{
  const mcp=mockMcp();const snapshot=await readLiveVenues({account:ACCOUNT},{mcp});
  assert.equal(snapshot.venues.length,2);assert.ok(snapshot.venues.every(v=>v.status==="AVAILABLE"));
  assert.equal(snapshot.venues[0].position.assetsRaw,"4000000");assert.equal(snapshot.venues[1].position.assetsRaw,"1500000");
  assert.equal(snapshot.venues.reduce((s,v)=>s+BigInt(v.position.assetsRaw),0n),5_500_000n);
  assert.equal(snapshot.venues[0].rate.startBlock,100000);
});

test("one adapter failure is isolated and all failures produce insufficient data",async()=>{
  const one=await analyze({intent:"compare",account:ACCOUNT},{mcp:mockMcp({failVenue:VENUES[0].address})});assert.equal(one.routing.status,"PARTIAL");assert.equal(one.routing.coverage.available,1);
  const snapshot={block:{number:1,timestamp:1},venues:VENUES.map(v=>({id:v.id,status:"UNAVAILABLE",reason:"timeout"}))};const all=route(snapshot,interpret({intent:"compare",account:ACCOUNT}));assert.equal(all.status,"INSUFFICIENT_DATA");
});

test("deposit creates bounded approval then deposit and round-trips calldata",async()=>{
  const run=await analyze({intent:"deposit",account:ACCOUNT,receiver:RECEIVER,amount:"10",asset:"USDC",horizonDays:30},{mcp:mockMcp({allowance:0})});
  assert.equal(run.routing.plan.approvalNeeded,true);assert.equal(run.routing.plan.transactions.length,2);assert.equal(run.routing.status,"CONDITIONAL");
  assert.deepEqual(decodePrepared(run.routing.plan.transactions[0]).arguments,[run.routing.plan.venueId===VENUES[0].id?VENUES[0].address.toLowerCase():VENUES[1].address.toLowerCase(),"10000000"]);
  assert.deepEqual(decodePrepared(run.routing.plan.transactions[1]).arguments,["10000000",RECEIVER]);
});

test("approval is omitted when allowance is sufficient",async()=>{
  const run=await analyze({intent:"deposit",account:ACCOUNT,receiver:ACCOUNT,amount:"1",asset:"USDC"},{mcp:mockMcp({allowance:2_000_000n})});
  assert.equal(run.routing.plan.approvalNeeded,false);assert.equal(run.routing.plan.transactions.length,1);assert.equal(run.routing.plan.transactions[0].kind,"DEPOSIT");
});

test("insufficient balance blocks deposit and does not prepare a transaction",async()=>{
  const run=await analyze({intent:"deposit",account:ACCOUNT,receiver:ACCOUNT,amount:"10",asset:"USDC"},{mcp:mockMcp({usdcBalance:1n})});
  assert.equal(run.routing.status,"BLOCKED");assert.equal(run.routing.plan,null);
});

test("withdraw routes only to held positions and preserves owner receiver caller",async()=>{
  const run=await analyze({intent:"withdraw",account:ACCOUNT,receiver:RECEIVER,amount:"1",asset:"USDC",objective:"immediacy"},{mcp:mockMcp()});
  assert.ok(["PREPARED","CONDITIONAL"].includes(run.routing.status));const tx=run.routing.plan.transactions[0];assert.deepEqual(decodePrepared(tx).arguments,["1000000",RECEIVER,ACCOUNT]);
});

test("cost assumptions can make the lower-rate venue win",async()=>{
  const snapshot=await readLiveVenues({account:ACCOUNT},{mcp:mockMcp({allowance:100_000_000n})});
  const baseline=route(snapshot,interpret({intent:"deposit",account:ACCOUNT,receiver:ACCOUNT,amount:"10",costs:{}}));
  const costly=route(snapshot,interpret({intent:"deposit",account:ACCOUNT,receiver:ACCOUNT,amount:"10",costs:{[baseline.decision.venueId]:"9000000"}}));
  assert.notEqual(costly.decision.venueId,baseline.decision.venueId);
});

test("unknown asset, missing fields, excessive decimals and ambiguous intent fail closed",async()=>{
  assert.equal(interpret({request:"do something"}).status,"NEEDS_INPUT");
  const snapshot=await readLiveVenues({account:ACCOUNT},{mcp:mockMcp()});assert.equal(route(snapshot,interpret({intent:"deposit",account:ACCOUNT,receiver:ACCOUNT,amount:"1",asset:"DAI"})).status,"BLOCKED");
  assert.throws(()=>route(snapshot,interpret({intent:"deposit",account:ACCOUNT,receiver:ACCOUNT,amount:"0.0000001"})),/more than 6 decimals/);
});

test("minimum acceptable deposit output excludes quotes below the threshold",async()=>{
  const run=await analyze({intent:"deposit",account:ACCOUNT,receiver:ACCOUNT,amount:"1",asset:"USDC",minOutput:"1000000000"},{mcp:mockMcp()});
  assert.equal(run.routing.status,"BLOCKED");assert.ok(run.routing.candidates.every(c=>!c.eligible));
});

test("stale saved plans expire without re-execution",async()=>{
  const run=await analyze({intent:"deposit",account:ACCOUNT,receiver:ACCOUNT,amount:"1"},{mcp:mockMcp()});const old={...run,routing:{...run.routing,plan:{...run.routing.plan,expiresAt:1}}};const reopened=reopenHistorical(old,2);assert.equal(reopened.routing.plan.status,"EXPIRED");assert.equal(reopened.reexecuted,false);assert.equal(isExpired(old.routing.plan,2),true);
});

test("no signing or broadcasting capability is allowlisted",()=>{assert.ok(!MCP_ALLOWLIST.some(x=>/send|sign|broadcast/i.test(x)));});

test("simulated outage label is explicit and healthy venue remains usable",async()=>{const run=await analyze({intent:"positions",account:ACCOUNT,outageVenue:VENUES[0].id},{mcp:mockMcp()});const failed=run.snapshot.venues.find(v=>v.id===VENUES[0].id);assert.match(failed.reason,/Injected adapter outage/);assert.equal(run.snapshot.venues.find(v=>v.id===VENUES[1].id).status,"AVAILABLE");});
