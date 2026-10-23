export const assertAddress = (value, label="address") => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(value))) throw new Error(`${label} must be a 20-byte EVM address.`);
  return String(value).toLowerCase();
};
export const word = (value) => BigInt(value).toString(16).padStart(64,"0");
export const addressWord = (value) => assertAddress(value).slice(2).padStart(64,"0");
export const encode = (selector, values=[]) => selector + values.join("");
export const encodeUint = (selector, value) => encode(selector,[word(value)]);
export const encodeAddress = (selector, value) => encode(selector,[addressWord(value)]);
export const encodeTwoAddress = (selector, a,b) => encode(selector,[addressWord(a),addressWord(b)]);
export const decodeUint = (hex,label="uint") => { if(!/^0x[0-9a-fA-F]{64,}$/.test(String(hex))) throw new Error(`Invalid ${label} result.`); return BigInt(hex); };
export const decodeAddress = (hex,label="address") => { if(!/^0x[0-9a-fA-F]{64,}$/.test(String(hex))) throw new Error(`Invalid ${label} result.`); return `0x${hex.slice(-40)}`.toLowerCase(); };
export const codeBytes = (hex) => /^0x[0-9a-fA-F]*$/.test(String(hex)) ? (hex.length-2)/2 : 0;
export const pow10 = (n) => 10n ** BigInt(n);
export function parseUnits(input, decimals) {
  const s=String(input).trim(); if(!/^(0|[1-9]\d*)(\.\d+)?$/.test(s)) throw new Error("Amount must be a positive decimal string.");
  const [whole,fraction=""] = s.split("."); if(fraction.length>decimals) throw new Error(`Amount has more than ${decimals} decimals.`);
  const value=BigInt(whole)*pow10(decimals)+BigInt((fraction+"0".repeat(decimals)).slice(0,decimals)||"0"); if(value<=0n) throw new Error("Amount must be greater than zero."); return value;
}
export function formatUnits(value,decimals,places=6){ const n=BigInt(value), base=pow10(decimals), whole=n/base, frac=(n%base).toString().padStart(decimals,"0").slice(0,places).replace(/0+$/,""); return frac?`${whole}.${frac}`:`${whole}`; }
export function ratioPpm(end,start){ return (BigInt(end)-BigInt(start))*1_000_000n/BigInt(start); }
export const nowIso = () => new Date().toISOString();
