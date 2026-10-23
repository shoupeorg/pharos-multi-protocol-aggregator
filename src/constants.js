export const ENGINE_VERSION = "multi-protocol-aggregator/1.0.0";
export const CHAIN_ID = 1672;
export const NETWORK = "Pharos Pacific Mainnet";
export const MCP_URL = "https://mcp.pharos.xyz/mcp";
export const USDC = { symbol: "USDC", address: "0xC879C018dB60520F4355C26eD1a6D572cdAC1815", decimals: 6 };
export const RATE_WINDOW_BLOCKS = 100000;
export const PLAN_TTL_SECONDS = 300;
export const DEFAULT_ACCOUNT = "0x15ddce897d76ac39c188ade4d353711a60395315";
export const WITHDRAWAL_EXAMPLE = "0x4117b9737f64d816be36f6c18c72409c98e4737c";
export const VENUES = [
  {
    id: "morpho-rockawayx", protocol: "Morpho", name: "RockawayX USDC V2", address: "0x047cd0a91e9b92ed979189a6c8a120bf280f02e5",
    asset: USDC.address, shareSymbol: "roxUSDC", shareDecimals: 18, type: "ERC-4626 synchronous",
    officialSource: "https://campaigns.morpho.org/opportunities/11686569320310112064",
    mechanicsSource: "https://docs.morpho.org/developers/earn/tutorials/assets-flow/"
  },
  {
    id: "morpho-sharpbyte", protocol: "Morpho", name: "SharpByte USDC Pharos Ecosystem", address: "0x15c25ED222fc498f672af5c3adb5ED0a96E1AFf1",
    asset: USDC.address, shareSymbol: "sbUSDC-ph-eco", shareDecimals: 18, type: "ERC-4626 synchronous",
    officialSource: "https://campaigns.morpho.org/opportunities/6848818814763389816",
    mechanicsSource: "https://docs.morpho.org/developers/earn/tutorials/assets-flow/"
  }
];
export const SELECTORS = {
  asset:"0x38d52e0f", decimals:"0x313ce567", balanceOf:"0x70a08231", allowance:"0xdd62ed3e", totalAssets:"0x01e1d114", totalSupply:"0x18160ddd",
  convertToAssets:"0x07a2d13a", previewDeposit:"0xef8b30f7", previewWithdraw:"0x0a28a477", previewRedeem:"0x4cdad506",
  deposit:"0x6e553f65", withdraw:"0xb460af94", redeem:"0xba087652", approve:"0x095ea7b3"
};
export const MCP_ALLOWLIST = ["get_chain_info","get_block_number","get_block","get_code","eth_call","estimate_gas","get_gas_price"];
