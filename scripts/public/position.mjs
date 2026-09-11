// SPDX-License-Identifier: MIT
// AI-assisted by OpenAI Codex.
// TickMath arithmetic/constants ported from Uniswap v4-core 59d3ecf (MIT),
// LiquidityAmounts from v4-periphery dce236d (MIT). See contracts/dependencies.json.
import assert from 'node:assert/strict';
import {encodeAbiParameters, encodeFunctionData, decodeEventLog, keccak256, parseAbi, parseAbiParameters, zeroAddress} from 'viem';

const Q96 = 1n << 96n;
const MULTIPLIERS = [
  'fffcb933bd6fad37aa2d162d1a594001', 'fff97272373d413259a46990580e213a',
  'fff2e50f5f656932ef12357cf3c7fdcc', 'ffe5caca7e10e4e61c3624eaa0941cd0',
  'ffcb9843d60f6159c9db58835c926644', 'ff973b41fa98c081472e6896dfb254c0',
  'ff2ea16466c96a3843ec78b326b52861', 'fe5dee046a99a2a811c461f1969c3053',
  'fcbe86c7900a88aedcffc83b479aa3a4', 'f987a7253ac413176f2b074cf7815e54',
  'f3392b0822b70005940c7a398e4b70f3', 'e7159475a2c29b7443b29c7fa6e889d9',
  'd097f3bdfd2022b8845ad8f792aa5825', 'a9f746462d870fdf8a65dc1f90e061e5',
  '70d869a156d2a1b890bb3df62baf32f7', '31be135f97d08fd981231505542fcfa6',
  '9aa508b5b7a84e1c677de54f3e99bc9', '5d6af8dedb81196699c329225ee604',
  '2216e584f5fa1ea926041bedfe98', '48a170391f7dc42444e8fa2',
].map(x => BigInt('0x' + x));
export function sqrtPriceAtTick(tick) {
  assert(Number.isInteger(tick) && Math.abs(tick) <= 887272, 'Invalid tick');
  const magnitude = Math.abs(tick);
  let ratio = 1n << 128n;
  for (let i = 0; i < MULTIPLIERS.length; i++)
    if (magnitude & (1 << i)) ratio = ratio * MULTIPLIERS[i] >> 128n;
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio + (1n << 32n) - 1n) >> 32n;
}
const min = (a, b) => a < b ? a : b;
export function liquidityForAmounts(price, lower, upper, amount0, amount1) {
  assert(lower > 0n && upper > lower && amount0 >= 0n && amount1 >= 0n);
  const l0 = (a, b) => amount0 * (a * b / Q96) / (b - a);
  const l1 = (a, b) => amount1 * Q96 / (b - a);
  return price <= lower ? l0(lower, upper) : price >= upper ? l1(lower, upper) : min(l0(price, upper), l1(lower, price));
}
function sqrt(value) {
  assert(value >= 0n);
  if (value < 2n) return value;
  let x = value, y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + value / x) / 2n; }
  return x;
}
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const decimal = (value, name) => {
  assert(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), `Invalid saved ${name}`);
  const result = BigInt(value);
  assert(result < (1n << 256n), `Invalid saved ${name}`);
  return result;
};
const TOKEN = parseAbi(['function balanceOf(address) view returns(uint256)', 'function approve(address,uint256) returns(bool)', 'function decimals() view returns(uint8)', 'function deposit() payable']);
const PERMIT = parseAbi(['function approve(address token,address spender,uint160 amount,uint48 expiration)']);
const MANAGER = parseAbi(['function extsload(bytes32) view returns(bytes32)', 'function initialize((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks),uint160) returns(int24)']);
const POSM = parseAbi(['function modifyLiquidities(bytes,uint256) payable', 'event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)']);
const POOL = '(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)';
export const POSITION_BUDGET = Object.freeze({usdc: 5_000_000n, weth: 3_000_000_000_000_000n, usdcReserve: 15_000_000n});
const CANONICAL = {
  usdc: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
  weth: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
  permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3',
  positionManager: '0x429ba70129df741b2ca2a85bc3a2a3328e5c09b4',
  poolManager: '0xe03a1074c86cfedd5c142c4f04f1a1536e203543',
};

/** Caller must pin deployed code and chain (a historical Sepolia fork is a rehearsal).
 * send(label,{to,data,value?}) must simulate, journal and return a successful receipt.
 * send.plan(key,produce) must durably save/reuse JSON-safe output before any sends.
 * Stored plans deliberately do not refresh expired deadlines or changed prices.
 * No key, RPC URL, direct wallet, or broadcast implementation is held by this module.
 * A successful mint followed by a failed postcondition is still a real minted NFT:
 * consult the caller's journal before any retry. Amounts below are bigint base units.
 */
export async function preparePosition({client, account, send, read, addresses}) {
  assert.equal(typeof send.plan, 'function', 'Durable send.plan is required');
  const owner = typeof account === 'string' ? account : account.address;
  for (const [name, address] of Object.entries(CANONICAL))
    assert(same(addresses[name], address), `Noncanonical Sepolia ${name}`);
  assert(!same(owner, zeroAddress), 'Zero owner');
  const a = addresses;
  assert(same(await read(a.positionManager, 'PositionManager', 'poolManager', []), a.poolManager), 'Wrong PosM manager');
  assert(same(await read(a.positionManager, 'PositionManager', 'permit2', []), a.permit2), 'Wrong Permit2');
  assert(same(await read(a.positionManager, 'PositionManager', 'WETH9', []), a.weth), 'Wrong WETH');
  const call = (address, abi, functionName, args = []) => client.readContract({address, abi, functionName, args});
  const tx = async (label, to, abi, functionName, args, value) => {
    const receipt = await send(label, {to, data: encodeFunctionData({abi, functionName, args}), ...(value === undefined ? {} : {value})});
    assert.equal(receipt.status, 'success', `${label} did not succeed`);
    return receipt;
  };
  assert.equal(await call(a.usdc, TOKEN, 'decimals'), 6, 'USDC decimals');
  assert.equal(await call(a.weth, TOKEN, 'decimals'), 18, 'WETH decimals');
  const usdcIs0 = BigInt(a.usdc) < BigInt(a.weth);
  const key = {currency0: usdcIs0 ? a.usdc : a.weth, currency1: usdcIs0 ? a.weth : a.usdc, fee: 3000, tickSpacing: 60, hooks: zeroAddress};
  const poolId = keccak256(encodeAbiParameters(parseAbiParameters(POOL), [key]));
  const slot = keccak256(encodeAbiParameters(parseAbiParameters('bytes32,uint256'), [poolId, 6n]));
  const state = async () => {
    const block = await client.getBlock();
    const word = BigInt(await client.readContract({address: a.poolManager, abi: MANAGER, functionName: 'extsload', args: [slot], blockNumber: block.number}));
    return {sqrtPriceX96: word & ((1n << 160n) - 1n), tick: Number(BigInt.asIntN(24, word >> 160n)), block};
  };
  const initialPrice = sqrt((usdcIs0 ? (10n ** 18n) * Q96 * Q96 / 2_000_000_000n : 2_000_000_000n * Q96 * Q96 / (10n ** 18n)));
  const init = await send.plan('position-initialize-plan', async () => {
    assert(await call(a.usdc, TOKEN, 'balanceOf', [owner]) >= POSITION_BUDGET.usdc + POSITION_BUDGET.usdcReserve, 'Need 20 USDC to preserve 15 USDC outside the position');
    // 2000 USDC (6 decimals) per WETH (18); initialization is a chosen test price.
    return {owner, poolId, required: (await state()).sqrtPriceX96 === 0n,
      price: initialPrice.toString()};
  });
  assert(same(init.owner, owner) && init.poolId === poolId, 'Initialization plan scope mismatch');
  assert.equal(typeof init.required, 'boolean', 'Invalid saved initialization decision');
  assert.equal(decimal(init.price, 'initialization price'), initialPrice, 'Invalid saved initialization price');
  if (init.required) await tx('position-initialize', a.poolManager, MANAGER, 'initialize', [key, initialPrice]);
  const initialized = init.required;
  const amount0Max = usdcIs0 ? POSITION_BUDGET.usdc : POSITION_BUDGET.weth;
  const amount1Max = usdcIs0 ? POSITION_BUDGET.weth : POSITION_BUDGET.usdc;
  const plan = await send.plan('position-mint-plan', async () => {
    const current = await state();
    assert(current.sqrtPriceX96 >= sqrtPriceAtTick(-887272) && current.sqrtPriceX96 < sqrtPriceAtTick(887272), 'Invalid pool price');
    assert(current.tick >= -887272 && current.tick <= 887272, 'Invalid pool tick');
    const center = Math.floor(current.tick / 60) * 60;
    const tickLower = Math.max(-887220, center - 600), tickUpper = Math.min(887220, center + 600);
    const lower = sqrtPriceAtTick(tickLower), upper = sqrtPriceAtTick(tickUpper);
    assert(current.sqrtPriceX96 > lower && current.sqrtPriceX96 < upper, 'Pool price is outside usable mint range');
    const liquidity = liquidityForAmounts(current.sqrtPriceX96, lower, upper, amount0Max, amount1Max) * 99n / 100n;
    assert(liquidity > 0n && liquidity < (1n << 128n), 'Budget cannot mint valid liquidity');
    const beforeUSDC = await call(a.usdc, TOKEN, 'balanceOf', [owner]);
    assert(beforeUSDC >= POSITION_BUDGET.usdc + POSITION_BUDGET.usdcReserve, 'Need 20 USDC to preserve 15 USDC outside the position');
    const beforeWETH = await call(a.weth, TOKEN, 'balanceOf', [owner]);
    const wrap = beforeWETH < POSITION_BUDGET.weth ? POSITION_BUDGET.weth - beforeWETH : 0n;
    return {owner, poolId, tickLower, tickUpper, liquidity: liquidity.toString(), beforeUSDC: beforeUSDC.toString(), beforeWETH: beforeWETH.toString(), wrap: wrap.toString(),
      expiration: Number(current.block.timestamp + 1800n), deadline: (current.block.timestamp + 600n).toString(),
      sourceBlock: current.block.number.toString(), sourceBlockHash: current.block.hash, sqrtPriceX96: current.sqrtPriceX96.toString()};
  });
  assert(same(plan.owner, owner) && plan.poolId === poolId, 'Mint plan scope mismatch');
  const {tickLower, tickUpper, expiration} = plan;
  const liquidity = decimal(plan.liquidity, 'liquidity'), beforeUSDC = decimal(plan.beforeUSDC, 'USDC balance'), beforeWETH = decimal(plan.beforeWETH, 'WETH balance'), wrap = decimal(plan.wrap, 'wrap'), deadline = decimal(plan.deadline, 'deadline');
  assert(wrap <= POSITION_BUDGET.weth, 'Saved wrap exceeds WETH budget');
  assert.equal(wrap, beforeWETH < POSITION_BUDGET.weth ? POSITION_BUDGET.weth - beforeWETH : 0n, 'Saved wrap does not match planned balance');
  assert(beforeUSDC >= POSITION_BUDGET.usdc + POSITION_BUDGET.usdcReserve, 'Saved plan lacks USDC reserve');
  assert(Number.isInteger(tickLower) && Number.isInteger(tickUpper) && tickLower >= -887220 && tickUpper <= 887220 && tickLower < tickUpper && tickLower % 60 === 0 && tickUpper % 60 === 0, 'Invalid saved tick range');
  assert(liquidity > 0n && liquidity < (1n << 128n), 'Invalid saved liquidity');
  const savedPrice = decimal(plan.sqrtPriceX96, 'sqrt price'), savedLower = sqrtPriceAtTick(tickLower), savedUpper = sqrtPriceAtTick(tickUpper);
  assert(savedPrice > savedLower && savedPrice < savedUpper, 'Saved price is outside mint range');
  assert.equal(liquidity, liquidityForAmounts(savedPrice, savedLower, savedUpper, amount0Max, amount1Max) * 99n / 100n, 'Saved liquidity does not match bounded plan');
  assert(Number.isSafeInteger(expiration) && expiration >= 0 && expiration < 2 ** 48 && BigInt(expiration) === deadline + 1200n, 'Invalid saved expiration/deadline');
  const sourceBlock = decimal(plan.sourceBlock, 'source block');
  assert(typeof plan.sourceBlockHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(plan.sourceBlockHash), 'Invalid saved source block hash');
  if (wrap) await tx('position-wrap-weth', a.weth, TOKEN, 'deposit', [], wrap);
  for (const [name, token, amount] of [['usdc', a.usdc, POSITION_BUDGET.usdc], ['weth', a.weth, POSITION_BUDGET.weth]]) {
    await tx(`position-${name}-approve-permit2`, token, TOKEN, 'approve', [a.permit2, amount]);
    await tx(`position-${name}-permit2-approve-posm`, a.permit2, PERMIT, 'approve', [token, a.positionManager, amount, expiration]);
  }
  const mint = encodeAbiParameters(parseAbiParameters(`${POOL},int24,int24,uint256,uint128,uint128,address,bytes`), [key, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner, '0x']);
  const settle = encodeAbiParameters(parseAbiParameters('address,address'), [key.currency0, key.currency1]);
  const unlockData = encodeAbiParameters(parseAbiParameters('bytes,bytes[]'), ['0x020d', [mint, settle]]);
  const receipt = await tx('position-mint', a.positionManager, POSM, 'modifyLiquidities', [unlockData, deadline]);
  const mints = receipt.logs.filter(log => same(log.address, a.positionManager)).flatMap(log => {
    try { const event = decodeEventLog({abi: POSM, data: log.data, topics: log.topics}); return event.eventName === 'Transfer' && same(event.args.from, zeroAddress) && same(event.args.to, owner) ? [event.args.tokenId] : []; }
    catch { return []; }
  });
  assert.equal(mints.length, 1, 'Mint receipt must identify exactly one owner NFT');
  const nftId = mints[0];
  assert(same(await read(a.positionManager, 'PositionManager', 'ownerOf', [nftId]), owner), 'Mint owner mismatch');
  assert.equal(await read(a.positionManager, 'PositionManager', 'getPositionLiquidity', [nftId]), liquidity, 'Mint liquidity mismatch');
  const [actualKey, info] = await read(a.positionManager, 'PositionManager', 'getPoolAndPositionInfo', [nftId]);
  assert.equal(keccak256(encodeAbiParameters(parseAbiParameters(POOL), [actualKey])), poolId, 'Mint pool mismatch');
  assert.equal(Number(BigInt.asIntN(24, info >> 8n)), tickLower, 'Mint lower tick mismatch');
  assert.equal(Number(BigInt.asIntN(24, info >> 32n)), tickUpper, 'Mint upper tick mismatch');
  assert.equal(info & 255n, 0n, 'Mint has subscriber');
  const afterUSDC = await call(a.usdc, TOKEN, 'balanceOf', [owner]), afterWETH = await call(a.weth, TOKEN, 'balanceOf', [owner]);
  assert(afterUSDC >= POSITION_BUDGET.usdcReserve && beforeUSDC - afterUSDC <= POSITION_BUDGET.usdc, 'USDC budget exceeded');
  assert(beforeWETH + wrap - afterWETH <= POSITION_BUDGET.weth, 'WETH budget exceeded');
  return {nftId, tokenId: nftId, key, poolId, tickLower, tickUpper, liquidity, initialized, usdcIs0,
    sourceBlock, sourceBlockHash: plan.sourceBlockHash, sqrtPriceX96: savedPrice,
    mintTransactionHash: receipt.transactionHash, mintBlock: receipt.blockNumber,
    budget: {...POSITION_BUDGET, wrappedWETH: wrap, spentUSDC: beforeUSDC - afterUSDC, spentWETH: beforeWETH + wrap - afterWETH, permit2Expiration: expiration},
    allowanceNotice: 'Bounded token and Permit2 approvals may retain unused allowance; PosM authorization expires after 30 minutes.',
    scope: 'Canonical Sepolia NFT setup; public execution or fork rehearsal is determined by the caller. Existing pool price is not a fair-value oracle.'};
}
