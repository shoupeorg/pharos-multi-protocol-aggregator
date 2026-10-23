import { CHAIN_ID, MCP_URL, NETWORK, RATE_WINDOW_BLOCKS, SELECTORS, USDC, VENUES } from "./constants.js";
import { addressWord, assertAddress, codeBytes, decodeAddress, decodeUint, encode, encodeAddress, encodeTwoAddress, encodeUint, formatUnits, ratioPpm, word } from "./fixed.js";
import { withPharosMcp } from "./pharos-mcp.js";

const DEAD = "0x000000000000000000000000000000000000dead";
const timeout = (promise, ms, label) => Promise.race([promise, new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label} timed out after ${ms}ms.`)),ms))]);
const callData = (selector,args=[]) => encode(selector,args.map((arg)=>/^0x[0-9a-fA-F]{40}$/.test(String(arg))?addressWord(arg):word(arg)));
const stamp = (block) => Number(BigInt(block.timestamp));

export class MorphoVaultAdapter {
  constructor(config){ this.config=config; }
  async read({call,account,block,startBlock,amountRaw="1000000",outage=false}){
    if(outage) throw new Error("Injected adapter outage for demonstration; not a protocol incident.");
    const observations=[]; const add=(kind,method,raw,extra={})=>{const x={id:`${this.config.id}-SRC-${observations.length+1}`,venueId:this.config.id,kind,method,raw,blockNumber:block.number,timestamp:block.timestamp,...extra};observations.push(x);return x.id;};
    const eth=async(to,data,at=block.number)=>decodeResult(await call("eth_call",{transaction:{to,data},block:at}));
    const [vaultCode,assetCode]=await Promise.all([call("get_code",{address:this.config.address,block:block.number}),call("get_code",{address:USDC.address,block:block.number})]);
    if(!codeBytes(vaultCode.code)||!codeBytes(assetCode.code)) throw new Error("Required runtime bytecode is unavailable.");
    const asset=decodeAddress(await eth(this.config.address,SELECTORS.asset),"asset"); if(asset!==USDC.address.toLowerCase()) throw new Error(`Unexpected asset ${asset}.`);
    const [shareDecimals,assetDecimals,totalAssets,totalSupply,shares,usdcBalance,allowance,deadShares,oneShareNow,oneShareThen,startBlockData,previewDeposit,previewWithdraw] = await Promise.all([
      eth(this.config.address,SELECTORS.decimals).then(x=>decodeUint(x,"share decimals")),
      eth(USDC.address,SELECTORS.decimals).then(x=>decodeUint(x,"asset decimals")),
      eth(this.config.address,SELECTORS.totalAssets).then(x=>decodeUint(x,"totalAssets")),
      eth(this.config.address,SELECTORS.totalSupply).then(x=>decodeUint(x,"totalSupply")),
      eth(this.config.address,encodeAddress(SELECTORS.balanceOf,account)).then(x=>decodeUint(x,"share balance")),
      eth(USDC.address,encodeAddress(SELECTORS.balanceOf,account)).then(x=>decodeUint(x,"USDC balance")),
      eth(USDC.address,encodeTwoAddress(SELECTORS.allowance,account,this.config.address)).then(x=>decodeUint(x,"allowance")),
      eth(this.config.address,encodeAddress(SELECTORS.balanceOf,DEAD)).then(x=>decodeUint(x,"dead shares")),
      eth(this.config.address,encodeUint(SELECTORS.convertToAssets,10n**BigInt(this.config.shareDecimals))).then(x=>decodeUint(x,"current one-share assets")),
      eth(this.config.address,encodeUint(SELECTORS.convertToAssets,10n**BigInt(this.config.shareDecimals)),startBlock).then(x=>decodeUint(x,"historical one-share assets")),
      call("get_block",{block:startBlock,includeTransactions:false}),
      eth(this.config.address,encodeUint(SELECTORS.previewDeposit,amountRaw)).then(x=>decodeUint(x,"previewDeposit")),
      eth(this.config.address,encodeUint(SELECTORS.previewWithdraw,amountRaw)).then(x=>decodeUint(x,"previewWithdraw"))
    ]);
    if(Number(shareDecimals)!==this.config.shareDecimals||Number(assetDecimals)!==USDC.decimals) throw new Error("Verified decimals do not match configuration.");
    const underlying=shares===0n?0n:decodeUint(await eth(this.config.address,encodeUint(SELECTORS.convertToAssets,shares)),"position conversion");
    const rateRaw=ratioPpm(oneShareNow,oneShareThen);
    add("identity","get_code/asset/decimals",`${codeBytes(vaultCode.code)}/${asset}/${shareDecimals}`);
    const positionSource=add("position","balanceOf/convertToAssets",`${shares}/${underlying}`);
    const rateSource=add("rate","convertToAssets",`${oneShareThen}/${oneShareNow}`,{startBlock,startTimestamp:stamp(startBlockData),unit:"ppm fixed-share change"});
    const accountSource=add("eligibility","balanceOf/allowance",`${usdcBalance}/${allowance}`);
    return {
      id:this.config.id,protocol:this.config.protocol,name:this.config.name,address:this.config.address,status:"AVAILABLE",observedAt:new Date(block.timestamp*1000).toISOString(),blockNumber:block.number,
      asset:{...USDC,address:asset},share:{symbol:this.config.shareSymbol,decimals:Number(shareDecimals)},type:this.config.type,
      position:{sharesRaw:shares.toString(),sharesFormatted:formatUnits(shares,this.config.shareDecimals,8),assetsRaw:underlying.toString(),assetsFormatted:formatUnits(underlying,USDC.decimals,6),sourceIds:[positionSource]},
      state:{totalAssetsRaw:totalAssets.toString(),totalSupplyRaw:totalSupply.toString(),deadSharesRaw:deadShares.toString(),depositAvailability:"ACCOUNT_SPECIFIC",withdrawAvailability:"ACCOUNT_SPECIFIC",limitsNote:"Morpho Vault V2 max* views return zero by design; capacity, liquidity-adapter and gate constraints require fresh account-specific validation."},
      quote:{assetAmountRaw:String(amountRaw),previewDepositSharesRaw:previewDeposit.toString(),previewWithdrawSharesRaw:previewWithdraw.toString(),blockNumber:block.number},
      account:{usdcBalanceRaw:usdcBalance.toString(),allowanceRaw:allowance.toString(),sourceIds:[accountSource]},
      rate:{kind:"vault share-value change over the observed period",fixedSharesRaw:(10n**BigInt(this.config.shareDecimals)).toString(),startAssetsRaw:oneShareThen.toString(),endAssetsRaw:oneShareNow.toString(),changePpm:rateRaw.toString(),changePercent:formatUnits(rateRaw,4,4),startBlock,startTimestamp:stamp(startBlockData),endBlock:block.number,endTimestamp:block.timestamp,elapsedSeconds:block.timestamp-stamp(startBlockData),sourceIds:[rateSource],guaranteed:false,annualized:false},
      sources:[this.config.officialSource,this.config.mechanicsSource],observations,readStatus:"LIVE"
    };
  }
  prepareDeposit({account,receiver,amountRaw,venue}){
    const amount=BigInt(amountRaw),approvalNeeded=BigInt(venue.account.allowanceRaw)<amount;
    const txs=[];
    if(approvalNeeded) txs.push(tx("APPROVE",account,USDC.address,SELECTORS.approve,[this.config.address,amount],`approve(${this.config.address}, ${amount})`,{spender:this.config.address,amountRaw:amount.toString(),bounded:true}));
    txs.push(tx("DEPOSIT",account,this.config.address,SELECTORS.deposit,[amount,receiver],`deposit(${amount}, ${receiver})`,{assetAmountRaw:amount.toString(),receiver}));
    return {approvalNeeded,transactions:txs};
  }
  prepareWithdraw({account,receiver,amountRaw}){ const amount=BigInt(amountRaw); return {approvalNeeded:false,transactions:[tx("WITHDRAW",account,this.config.address,SELECTORS.withdraw,[amount,receiver,account],`withdraw(${amount}, ${receiver}, ${account})`,{assetAmountRaw:amount.toString(),receiver,owner:account})]}; }
}

function decodeResult(response){ if(!response||typeof response.result!=="string")throw new Error("eth_call returned no result."); return response.result; }
function tx(kind,from,to,selector,args,decoded,extra){ const words=args.map((a)=>typeof a==="string"&&/^0x[0-9a-fA-F]{40}$/.test(a)?addressWord(a):word(a)); return {kind,chainId:CHAIN_ID,from:assertAddress(from,"from"),to:assertAddress(to,"destination"),value:"0",data:encode(selector,words),decoded:{function:decoded,...extra},gasEstimate:"UNKNOWN",validation:"NOT_SIMULATED"}; }
export function decodePrepared(transaction){
  const data=transaction.data; const selector=data.slice(0,10); const words=[]; for(let i=10;i<data.length;i+=64)words.push(data.slice(i,i+64));
  const addr=(i)=>`0x${words[i].slice(-40)}`.toLowerCase(); const uint=(i)=>BigInt(`0x${words[i]}`).toString();
  if(selector===SELECTORS.approve)return {function:"approve",arguments:[addr(0),uint(1)]};
  if(selector===SELECTORS.deposit)return {function:"deposit",arguments:[uint(0),addr(1)]};
  if(selector===SELECTORS.withdraw)return {function:"withdraw",arguments:[uint(0),addr(1),addr(2)]};
  if(selector===SELECTORS.redeem)return {function:"redeem",arguments:[uint(0),addr(1),addr(2)]};
  throw new Error("Unknown prepared selector.");
}

export async function readLiveVenues(input={},options={}){
  const execute=async({call,tools})=>{
    const chain=await call("get_chain_info"); if(Number(chain.chainId)!==CHAIN_ID)throw new Error(`Wrong chain ${chain.chainId}; expected ${CHAIN_ID}.`);
    const end=Number((await call("get_block_number")).blockNumber); const blockData=await call("get_block",{block:end,includeTransactions:false}); const block={number:end,timestamp:stamp(blockData),hash:blockData.hash}; const startBlock=Math.max(0,end-RATE_WINDOW_BLOCKS);
    const account=assertAddress(input.account,"account");
    const adapters=VENUES.map(v=>new MorphoVaultAdapter(v));
    const settled=await Promise.all(adapters.map(async(adapter)=>{try{return await timeout(adapter.read({call,account,block,startBlock,amountRaw:input.amountRaw||"1000000",outage:input.outageVenue===adapter.config.id}),45000,adapter.config.id);}catch(error){return {id:adapter.config.id,protocol:adapter.config.protocol,name:adapter.config.name,address:adapter.config.address,status:"UNAVAILABLE",reason:error.message,observedAt:new Date().toISOString(),sources:[adapter.config.officialSource,adapter.config.mechanicsSource],observations:[]};}}));
    return {schemaVersion:1,engineVersion:"multi-protocol-aggregator/1.0.0",network:NETWORK,chainId:CHAIN_ID,mcpEndpoint:MCP_URL,mcpTools:tools,block,account,venues:settled,readOnly:true};
  };
  return options.mcp?execute(options.mcp):withPharosMcp(execute,options);
}

export async function validatePrepared(plan,call){
  const validated=[];
  for(const transaction of plan.transactions){
    const roundTrip=decodePrepared(transaction); let gas="UNKNOWN",simulation="NOT_SIMULATED",reason="";
    try{const estimate=await call("estimate_gas",{transaction:{from:transaction.from,to:transaction.to,data:transaction.data,value:"0x0"}});gas=String(estimate.gas);simulation="SIMULATED";}catch(error){reason=error.message;simulation=transaction.kind==="DEPOSIT"&&plan.approvalNeeded?"CONDITIONAL":"FAILED";}
    validated.push({...transaction,roundTrip,gasEstimate:gas,validation:simulation,validationReason:reason||undefined});
  }
  return validated;
}
