// AI-assisted by OpenAI Codex. Offline mocks; these do not establish public mint acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData, decodeAbiParameters, encodeEventTopics, parseAbi, parseAbiParameters, toHex, zeroAddress} from 'viem';
import {preparePosition, POSITION_BUDGET, sqrtPriceAtTick, liquidityForAmounts} from './position.mjs';

const A = {
  usdc: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', weth: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
  permit2: '0x000000000022d473030f116ddee9f6b43ac78ba3', positionManager: '0x429ba70129df741b2ca2a85bc3a2a3328e5c09b4',
  poolManager: '0xe03a1074c86cfedd5c142c4f04f1a1536e203543',
};
const owner = '0x1111111111111111111111111111111111111111';
const POOL = '(address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks)';
const ABI = parseAbi([
  'function approve(address,uint256) returns(bool)', 'function approve(address token,address spender,uint160 amount,uint48 expiration)',
  'function deposit() payable', 'function modifyLiquidities(bytes,uint256) payable',
  `function initialize(${POOL},uint160) returns(int24)`,
  'event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)',
]);
function mock({uninitialized = false, usdc = 20_000_000n, initialWeth = 0n, corruptMint = false} = {}) {
  const plans = new Map(), receipts = new Map(), calls = [], attempts = [];
  let cash = usdc, weth = initialWeth, tick = 59600, price = uninitialized ? 0n : sqrtPriceAtTick(tick), minted, timestamp = 10000n;
  let failOnce;
  const client = {
    getBlock: async () => ({number: 100n, hash: toHex(100n, {size: 32}), timestamp}),
    readContract: async ({address, functionName}) => {
      if (functionName === 'decimals') return address === A.usdc ? 6 : 18;
      if (functionName === 'balanceOf') return address === A.usdc ? cash : weth;
      assert.equal(functionName, 'extsload');
      return toHex(price | (BigInt.asUintN(24, BigInt(tick)) << 160n), {size: 32});
    },
  };
  const send = async (label, request) => {
    attempts.push({label, request});
    if (receipts.has(label)) {
      assert.deepEqual(request, calls.find(x => x.label === label).request, 'Replay changed transaction');
      return receipts.get(label);
    }
    if (failOnce === label) { failOnce = undefined; throw new Error('Injected interruption'); }
    const decoded = decodeFunctionData({abi: ABI, data: request.data});
    const receipt = {status: 'success', transactionHash: toHex(BigInt(calls.length + 1), {size: 32}), blockNumber: 101n, logs: []};
    if (decoded.functionName === 'deposit') weth += request.value;
    if (decoded.functionName === 'initialize') {
      price = decoded.args[1];
      // Independent binary search inverts the monotonic price map for this mock.
      let low = -887272, high = 887272;
      while (low < high) { const mid = Math.ceil((low + high) / 2); if (sqrtPriceAtTick(mid) <= price) low = mid; else high = mid - 1; }
      tick = low;
    }
    if (decoded.functionName === 'modifyLiquidities') {
      const [actions, params] = decodeAbiParameters(parseAbiParameters('bytes,bytes[]'), decoded.args[0]);
      assert.equal(actions, '0x020d', 'Only exact mint and user-funded SETTLE_PAIR');
      const [key, lower, upper, liquidity, max0, max1, receiver, hookData] = decodeAbiParameters(parseAbiParameters(`${POOL},int24,int24,uint256,uint128,uint128,address,bytes`), params[0]);
      assert.equal(max0, POSITION_BUDGET.usdc); assert.equal(max1, POSITION_BUDGET.weth);
      assert.equal(receiver.toLowerCase(), owner); assert.equal(hookData, '0x');
      assert.deepEqual(decodeAbiParameters(parseAbiParameters('address,address'), params[1]).map(x => x.toLowerCase()), [A.usdc, A.weth]);
      assert.equal(decoded.args[1], 10600n);
      minted = {key, liquidity, info: (BigInt.asUintN(24, BigInt(lower)) << 8n) | (BigInt.asUintN(24, BigInt(upper)) << 32n)};
      cash -= 4_950_000n; weth -= 1_000_000n;
      receipt.logs = [{address: A.positionManager, data: '0x', topics: encodeEventTopics({abi: ABI, eventName: 'Transfer', args: {from: zeroAddress, to: corruptMint ? A.usdc : owner, tokenId: 79123n}})}];
    }
    calls.push({label, request, decoded}); receipts.set(label, receipt); return receipt;
  };
  send.plan = async (key, produce) => {
    if (!plans.has(key)) plans.set(key, JSON.parse(JSON.stringify(await produce())));
    return JSON.parse(JSON.stringify(plans.get(key)));
  };
  const read = async (_address, artifact, fn, args) => {
    assert.equal(artifact, 'PositionManager');
    if (fn === 'poolManager') return A.poolManager;
    if (fn === 'permit2') return A.permit2;
    if (fn === 'WETH9') return A.weth;
    assert.deepEqual(args, [79123n], 'Must use receipt-derived NFT, never nextTokenId');
    if (fn === 'ownerOf') return owner;
    if (fn === 'getPositionLiquidity') return minted.liquidity;
    assert.equal(fn, 'getPoolAndPositionInfo'); return [minted.key, minted.info];
  };
  return {args: {client, account: owner, send, read, addresses: A}, calls, attempts, plans,
    interrupt: label => { failOnce = label; }, advance: () => { timestamp += 10000n; tick += 600; price = sqrtPriceAtTick(tick); }};
}

test('TickMath matches fixed public vectors and range limits', () => {
  assert.equal(sqrtPriceAtTick(-887272), 4295128739n);
  assert.equal(sqrtPriceAtTick(887272), 1461446703485210103287273052203988822378723970342n);
  assert.equal(sqrtPriceAtTick(0), 79228162514264337593543950336n);
  assert.equal(sqrtPriceAtTick(1), 79232123823359799118286999568n);
  assert.equal(sqrtPriceAtTick(-1), 79224201403219477170569942574n);
  assert.throws(() => sqrtPriceAtTick(887273)); assert.throws(() => sqrtPriceAtTick(1.1));
});

test('liquidity budgets bound independently rounded-up native amount deltas', () => {
  const q = 1n << 96n, ceil = (a, b) => (a + b - 1n) / b;
  for (const tick of [-240000, -600, 0, 59600, 200000, 480000]) {
    const lower = sqrtPriceAtTick(tick - 600), upper = sqrtPriceAtTick(tick + 600);
    for (const price of [lower, sqrtPriceAtTick(tick), upper]) {
      const l = liquidityForAmounts(price, lower, upper, 5_000_000n, 3_000_000_000_000_000n) * 99n / 100n;
      const p = price < lower ? lower : price > upper ? upper : price;
      const needed0 = ceil(ceil(l * q * (upper - p), upper), p);
      const needed1 = ceil(l * (p - lower), q);
      assert(needed0 <= 5_000_000n && needed1 <= 3_000_000_000_000_000n);
    }
  }
});

test('existing pool mint uses exact bounded Permit2 approvals and receipt token identity', async () => {
  const x = mock(), result = await preparePosition(x.args);
  assert.equal(result.nftId, 79123n); assert.equal(result.initialized, false);
  assert.equal(result.budget.spentUSDC, 4_950_000n);
  assert.equal(x.calls.length, 6);
  assert(!x.calls.some(x => x.request.to === A.positionManager && x.decoded.functionName !== 'modifyLiquidities'));
  for (const token of ['usdc', 'weth']) {
    const cap = POSITION_BUDGET[token];
    const erc = x.calls.find(x => x.label === `position-${token}-approve-permit2`);
    assert.equal(erc.decoded.args[0].toLowerCase(), A.permit2); assert.equal(erc.decoded.args[1], cap);
    const p = x.calls.find(x => x.label === `position-${token}-permit2-approve-posm`);
    assert.equal(p.decoded.args[1].toLowerCase(), A.positionManager); assert.equal(p.decoded.args[2], cap); assert.equal(p.decoded.args[3], 11800);
  }
});

test('restart replays identical plans and transactions despite changed time, price and balances', async () => {
  const x = mock(); x.interrupt('position-usdc-approve-permit2');
  await assert.rejects(preparePosition(x.args), /Injected interruption/);
  const saved = JSON.stringify([...x.plans]); x.advance();
  const result = await preparePosition(x.args);
  assert.equal(result.nftId, 79123n); assert.equal(JSON.stringify([...x.plans]), saved);
  const again = await preparePosition(x.args);
  assert.equal(again.nftId, result.nftId); assert.equal(x.calls.length, 6, 'No duplicate broadcast after mint');
  assert.equal(x.attempts.filter(x => x.label === 'position-wrap-weth').length, 3);
});

test('uninitialized pool uses decimal-adjusted test price and retains stable init decision on resume', async () => {
  const x = mock({uninitialized: true});
  const result = await preparePosition(x.args);
  assert.equal(result.initialized, true);
  const init = x.calls[0]; assert.equal(init.decoded.functionName, 'initialize');
  const p = init.decoded.args[1], target = (10n ** 18n) * (1n << 192n) / 2_000_000_000n;
  assert(p * p <= target && (p + 1n) * (p + 1n) > target);
  await preparePosition(x.args); assert.equal(x.calls.length, 7);
});

test('insufficient reserve and wrong canonical manager fail before any send', async () => {
  const x = mock({usdc: 19_999_999n}); await assert.rejects(preparePosition(x.args), /preserve 15 USDC/); assert.equal(x.calls.length, 0);
  const y = mock(); await assert.rejects(preparePosition({...y.args, addresses: {...A, poolManager: A.usdc}}), /Noncanonical/); assert.equal(y.calls.length, 0);
});

test('wrong recipient mint log is refused even after successful transaction', async () => {
  const x = mock({corruptMint: true}); await assert.rejects(preparePosition(x.args), /exactly one owner NFT/);
  assert.equal(x.calls.at(-1).label, 'position-mint');
});

test('corrupted saved mint plans fail before wrapping or approving', async () => {
  for (const change of [
    {wrap: (POSITION_BUDGET.weth + 1n).toString()}, {wrap: '-1'}, {deadline: '-1'}, {deadline: '10601'},
    {tickLower: 59001}, {tickUpper: 58980}, {liquidity: '0'}, {liquidity: (1n << 128n).toString()},
    {expiration: 1.5}, {sourceBlock: '-1'}, {sourceBlockHash: '0x1234'},
  ]) {
    const x = mock(); x.interrupt('position-wrap-weth');
    await assert.rejects(preparePosition(x.args), /Injected interruption/);
    Object.assign(x.plans.get('position-mint-plan'), change);
    await assert.rejects(preparePosition(x.args), /saved|Saved|Invalid/);
    assert.equal(x.calls.length, 0);
  }
});

test('corrupted saved initialization price is refused before initialization', async () => {
  const x = mock({uninitialized: true}); x.interrupt('position-initialize');
  await assert.rejects(preparePosition(x.args), /Injected interruption/);
  x.plans.get('position-initialize-plan').price = '1';
  await assert.rejects(preparePosition(x.args), /initialization price/);
  assert.equal(x.calls.length, 0);
});
