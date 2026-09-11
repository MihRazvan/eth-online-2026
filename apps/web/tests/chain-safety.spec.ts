import { test, expect } from "@playwright/test";
import { zeroAddress, type Address } from "viem";
import {
  assertChainScope,
  currencyMetadata,
  type Deployment,
} from "../src/chainAdapter";
const sepolia = {
  mode: "testnet",
  chainId: 11155111,
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  poolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
  positionManager: "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4",
  usdc: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
} as Deployment;
test("native ETH metadata never calls ERC20 methods at address zero", async () => {
  let calls = 0;
  const read = async (address: Address): Promise<readonly [number, string]> => {
    calls++;
    expect(address).not.toBe(zeroAddress);
    return [6, "USDC"];
  };
  expect(await currencyMetadata(zeroAddress, read)).toEqual([18, "ETH"]);
  expect(calls).toBe(0);
  expect(await currencyMetadata(sepolia.usdc, read)).toEqual([6, "USDC"]);
  expect(calls).toBe(1);
});
test("public configuration requires the independently pinned Sepolia manager and USDC", () => {
  expect(() => assertChainScope(sepolia)).not.toThrow();
  expect(() => assertChainScope({ ...sepolia, chainId: 1 })).toThrow(
    "Only verified Ethereum Sepolia",
  );
  expect(() =>
    assertChainScope({
      ...sepolia,
      usdc: "0x0000000000000000000000000000000000000001",
    }),
  ).toThrow("not the pinned canonical");
  expect(() =>
    assertChainScope({
      ...sepolia,
      positionManager: "0x0000000000000000000000000000000000000001",
    }),
  ).toThrow("not the pinned canonical");
  expect(() =>
    assertChainScope({
      ...sepolia,
      mode: "local",
      chainId: 31337,
      rpcUrl: "https://remote.invalid",
    }),
  ).toThrow("loopback chain 31337");
});
