import { ENGINE_VERSION } from "./constants.js";
import { readLiveVenues, validatePrepared } from "./adapters.js";
import { interpret, isExpired, route } from "./router.js";
import { withPharosMcp } from "./pharos-mcp.js";
import { parseUnits } from "./fixed.js";

export async function analyze(input={},options={}){
  const interpreted=interpret(input);
  if(interpreted.status!=="OK")return envelope({input,interpreted,snapshot:null,routing:{status:interpreted.status,interpreted,candidates:[],plan:null}});
  const execute=async(mcp)=>{
    const amountRaw=interpreted.amount?parseUnits(interpreted.amount,6).toString():"1000000";
    const snapshot=await readLiveVenues({account:interpreted.account,amountRaw,outageVenue:input.outageVenue},{mcp});
    const routing=route(snapshot,interpreted);
    if(routing.plan){routing.plan.transactions=await validatePrepared(routing.plan,mcp.call);routing.plan.status=deriveStatus(routing.plan);routing.status=routing.plan.status;}
    return envelope({input,interpreted,snapshot,routing});
  };
  return options.mcp?execute(options.mcp):withPharosMcp(execute,options);
}
function deriveStatus(plan){if(plan.transactions.some(t=>t.validation==="FAILED"))return "BLOCKED";if(plan.approvalNeeded||plan.transactions.some(t=>t.validation==="CONDITIONAL"||t.validation==="NOT_SIMULATED"))return "CONDITIONAL";return "PREPARED";}
function envelope(data){return {schemaVersion:1,engineVersion:ENGINE_VERSION,capturedAt:new Date().toISOString(),readOnly:true,unsignedOnly:true,noBroadcast:true,...data};}
export function reopenHistorical(run,nowSeconds=Math.floor(Date.now()/1000)){return {...run,historical:true,reexecuted:false,routing:run.routing?.plan?{...run.routing,plan:{...run.routing.plan,status:isExpired(run.routing.plan,nowSeconds)?"EXPIRED":run.routing.plan.status}}:run.routing};}
