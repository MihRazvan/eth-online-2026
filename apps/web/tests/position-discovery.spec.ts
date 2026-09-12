import { test, expect } from '@playwright/test';
import { zeroAddress } from 'viem';
import { positionId, positionIneligibility, recentPositionIds } from '../src/positionDiscovery';

const usdc = '0x1111111111111111111111111111111111111111';
const other = '0x2222222222222222222222222222222222222222';
test('position lookup accepts only exact Sepolia v4 links or uint256 IDs', () => {
  expect(positionId(' 039220 ')).toBe('39220');
  expect(positionId('https://app.uniswap.org/positions/v4/ethereum_sepolia/39222?utm_source=test')).toBe('39222');
  for (const input of ['0', '-1', '1e4', '1.5', (1n << 256n).toString(), '9'.repeat(1000),
    'https://app.uniswap.org/positions/v4/ethereum/39220',
    'https://evil.example/positions/v4/ethereum_sepolia/39220',
    'https://app.uniswap.org.evil.example/positions/v4/ethereum_sepolia/39220',
    'https://user:pass@app.uniswap.org/positions/v4/ethereum_sepolia/39220',
    'https://app.uniswap.org/positions/v3/ethereum_sepolia/39220', 'javascript:alert(1)']) {
    expect(() => positionId(input)).toThrow();
  }
});
test('discovered positions retain currency, hook, liquidity and subscriber restrictions', () => {
  const key = { currency0: zeroAddress, currency1: usdc, hooks: zeroAddress };
  expect(positionIneligibility(key, 0n, 1n, usdc)).toBeUndefined();
  expect(positionIneligibility({ ...key, currency1: other }, 0n, 1n, usdc)).toContain('USDC');
  expect(positionIneligibility({ ...key, hooks: other }, 0n, 1n, usdc)).toContain('hooks');
  expect(positionIneligibility(key, 0n, 0n, usdc)).toContain('liquidity');
  expect(positionIneligibility(key, 1n, 1n, usdc)).toContain('subscriber');
});
test('recent search bounds RPC work, includes page edges and deduplicates transfers', async () => {
  const ranges: bigint[][] = [];
  const result = await recentPositionIds(60_000n, async (from, to) => {
    ranges.push([from, to]);
    return ranges.length === 1 ? [39220n, 39220n, 39221n] : [];
  });
  expect(ranges).toHaveLength(10);
  expect(ranges[0]).toEqual([55_001n, 60_000n]);
  expect(ranges[9]).toEqual([10_001n, 15_000n]);
  for (let i = 1; i < ranges.length; i++) expect(ranges[i][1] + 1n).toBe(ranges[i - 1][0]);
  expect(result).toEqual({ ids: ['39221', '39220'], incomplete: false });
  const small = await recentPositionIds(10n, async (from, to) => {
    expect([from, to]).toEqual([0n, 10n]); return [1n];
  });
  expect(small.ids).toEqual(['1']);
});
test('partial RPC failure preserves earlier candidates and reports incomplete discovery', async () => {
  let calls = 0;
  const result = await recentPositionIds(60_000n, async () => {
    if (++calls === 1) return [39222n];
    throw new Error('https://secret.invalid/token');
  });
  expect(result).toEqual({ ids: ['39222'], incomplete: true });
  expect(calls).toBe(2);
});
test('large incoming inventory is capped without treating it as complete', async () => {
  let calls = 0;
  const result = await recentPositionIds(60_000n, async () => {
    calls++; return Array.from({ length: 101 }, (_, i) => BigInt(i + 1));
  });
  expect(result.ids).toHaveLength(100);
  expect(result.incomplete).toBe(true);
  expect(calls).toBe(1);
});

test('exactly filling the discovery cap cannot label unsearched older pages complete', async () => {
  const result = await recentPositionIds(60_000n, async () => Array.from({ length: 100 }, (_, i) => BigInt(i + 1)));
  expect(result.ids).toHaveLength(100);
  expect(result.incomplete).toBe(true);
});
