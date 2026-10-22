import { createPublicClient, http, formatUnits } from "viem";
const addr = "0x05523af5bd166816D1418Ebf7D6371e1fFB1D2e6";
const abi = [{ name:"balanceOf", type:"function", stateMutability:"view", inputs:[{name:"a",type:"address"}], outputs:[{type:"uint256"}] }];
const chains = [
  { name:"ethereum", id:1, rpc:"https://eth.llamarpc.com", usdc:"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", native:"ETH" },
  { name:"arbitrum", id:42161, rpc:"https://arb1.arbitrum.io/rpc", usdc:"0xaf88d065e77c8cC2239327C5EDb3A432268e5831", native:"ETH" },
  { name:"optimism", id:10, rpc:"https://mainnet.optimism.io", usdc:"0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", native:"ETH" },
  { name:"polygon", id:137, rpc:"https://polygon-rpc.com", usdc:"0x3c499c542cEF5E3811e1192ce70d8cC03d29c029", native:"POL" },
  { name:"base", id:8453, rpc:"https://mainnet.base.org", usdc:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", native:"ETH" },
  { name:"bsc", id:56, rpc:"https://bsc-dataseed.binance.org", usdc:"0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", native:"BNB" },
];
for (const ch of chains) {
  try {
    const c = createPublicClient({ chain: { id: ch.id, name: ch.name, nativeCurrency:{name:ch.native,symbol:ch.native,decimals:18}, rpcUrls:{default:{http:[ch.rpc]}} }, transport: http(ch.rpc, { timeout: 15000 }) });
    const native = await c.getBalance({ address: addr });
    const usdc = await c.readContract({ address: ch.usdc, abi, functionName: "balanceOf", args: [addr] });
    const nonce = await c.getTransactionCount({ address: addr });
    console.log(ch.name.padEnd(10), "native:", formatUnits(native,18).slice(0,12).padEnd(14), "USDC:", formatUnits(usdc,6).padEnd(10), "nonce:", nonce);
  } catch (e) { console.log(ch.name.padEnd(10), "ERR", String(e).slice(0,100)); }
}
