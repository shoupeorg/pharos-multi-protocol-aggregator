import { Client } from "../../official-pharos-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../../official-pharos-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import { encodeFunctionData, decodeFunctionResult, parseAbi } from "../../official-pharos-mcp/node_modules/viem/_esm/index.js";
import { fileURLToPath } from "node:url";

const VAULTS = ["0x047cd0a91e9b92ed979189a6c8a120bf280f02e5", "0x15c25ED222fc498f672af5c3adb5ED0a96E1AFf1"];
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL("../../official-pharos-mcp/dist/src/index.js", import.meta.url))], env: { ...process.env, PHAROS_RPC_URL: "https://rpc.pharos.xyz", PHAROS_CHAIN_ID: "1672", ENABLE_SEND_RAW_TRANSACTION: "false" }, stderr: "pipe" });
const client = new Client({ name: "pharos-holder-search", version: "0.1.0" });
const parse = (r) => JSON.parse(r.content.find((x) => x.type === "text").text);
await client.connect(transport);
try {
  const call = async (name, args) => parse(await client.callTool({ name, arguments: args }));
  const latest = Number((await call("get_block_number", {})).blockNumber);
  const found = [];
  for (const vault of VAULTS) {
    const candidates = new Set();
    for (let window = 0; window < 40 && candidates.size < 20; window += 1) {
      const to = latest - window * 1000;
      const from = to - 999;
      const logs = await call("get_logs", { address: vault, topics: [TRANSFER], fromBlock: from, toBlock: to });
      for (const log of logs) if (log.topics?.[2]) candidates.add(`0x${log.topics[2].slice(-40)}`);
    }
    for (const account of candidates) {
      if (/^0x0{40}$/i.test(account)) continue;
      const data = encodeFunctionData({ abi, functionName: "balanceOf", args: [account] });
      const raw = (await call("eth_call", { transaction: { to: vault, data }, block: latest })).result;
      const balance = decodeFunctionResult({ abi, functionName: "balanceOf", data: raw });
      if (balance > 0n) { found.push({ vault, account, sharesRaw: balance.toString(), latest }); break; }
    }
  }
  console.log(JSON.stringify({ searchedAtBlock: latest, windowsPerVaultMax: 40, found }, null, 2));
} finally { await client.close(); }
