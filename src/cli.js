#!/usr/bin/env node
import { analyze } from "./engine.js";
const args=process.argv.slice(2);const get=(name,fallback)=>{const i=args.indexOf(`--${name}`);return i>=0?args[i+1]:fallback;};
const input={request:get("request","Compare supported vault rates"),intent:get("intent"),account:get("account"),receiver:get("receiver"),amount:get("amount"),asset:get("asset","USDC"),horizonDays:Number(get("horizon","30")),objective:get("objective","highest-net-value"),outageVenue:get("outage")};
try{console.log(JSON.stringify(await analyze(input),null,2));}catch(error){console.error(JSON.stringify({error:error.message},null,2));process.exitCode=1;}
