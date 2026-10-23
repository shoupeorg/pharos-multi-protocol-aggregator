import { encodeFunctionData, decodeFunctionResult, parseAbi } from "../../official-pharos-mcp/node_modules/viem/_esm/index.js";
import { Client } from "../../official-pharos-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../../official-pharos-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import { fileURLToPath } from "node:url";

const venues = [
  { id: "centrifuge-jtrsy", address: "0x160e0dd4c4f693b05eca83bc2ec6fd51954fc434" },
  { id: "morpho-rockawayx", address: "0x047cd0a91e9b92ed979189a6c8a120bf280f02e5" },
  { id: "morpho-sharpbyte", address: "0x15c25ED222fc498f672af5c3adb5ED0a96E1AFf1" },
];
const account = "0x15ddce897d76ac39c188ade4d353711a60395315";
const abi = parseAbi([
  "function asset() view returns (address)", "function share() view returns (address)",
  "function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)", "function convertToAssets(uint256) view returns (uint256)",
  "function maxDeposit(address) view returns (uint256)", "function maxWithdraw(address) view returns (uint256)",
  "function maxRedeem(address) view returns (uint256)", "function previewDeposit(uint256) view returns (uint256)",
  "function previewWithdraw(uint256) view returns (uint256)", "function isPermissioned(address) view returns (bool)",
  "function deposit(uint256,address) returns (uint256)", "function withdraw(uint256,address,address) returns (uint256)",
  "function redeem(uint256,address,address) returns (uint256)",
  "function requestDeposit(uint256,address,address) returns (uint256)",
  "function requestRedeem(uint256,address,address) returns (uint256)",
]);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("../../official-pharos-mcp/dist/src/index.js", import.meta.url))],
  env: { ...process.env, PHAROS_RPC_URL: "https://rpc.pharos.xyz", PHAROS_CHAIN_ID: "1672", PHAROS_NATIVE_SYMBOL: "PROS", ENABLE_SEND_RAW_TRANSACTION: "false" },
  stderr: "pipe",
});
const client = new Client({ name: "pharos-multi-protocol-foundation", version: "0.1.0" });
const parse = (response, name) => {
  const text = response.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error(`${name} returned no text.`);
  const value = JSON.parse(text);
  if (response.isError || value?.error) throw new Error(value?.error?.message || `${name} failed.`);
  return value;
};
await client.connect(transport);
try {
await (async ({ call, tools }) => {
  const chain = await call("get_chain_info");
  const block = Number((await call("get_block_number")).blockNumber);
  const read = async (to, name, args = []) => {
    try {
      const data = encodeFunctionData({ abi, functionName: name, args });
      const response = await call("eth_call", { transaction: { to, data }, block });
      return { ok: true, value: decodeFunctionResult({ abi, functionName: name, data: response.result }).toString() };
    } catch (error) { return { ok: false, error: error.message }; }
  };
  const output = { chain, block, tools, account, venues: [] };
  for (const venue of venues) {
    const code = await call("get_code", { address: venue.address, block });
    const values = {};
    for (const [name, args] of [
      ["asset", []], ["share", []], ["decimals", []], ["balanceOf", [account]],
      ["maxDeposit", [account]], ["maxWithdraw", [account]], ["maxRedeem", [account]],
      ["previewDeposit", [1_000_000n]], ["previewWithdraw", [1_000_000n]], ["isPermissioned", [account]],
    ]) values[name] = await read(venue.address, name, args);
    output.venues.push({ ...venue, codeBytes: (code.code.length - 2) / 2, values });
  }
  console.log(JSON.stringify(output, null, 2));
})({
  tools: (await client.listTools()).tools.map((tool) => tool.name),
  call: async (name, args = {}) => parse(await client.callTool({ name, arguments: args }), name),
});
} finally { await client.close(); }
