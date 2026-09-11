declare module "*core/src/economics.mjs" {
  export function claimPayout(input: {
    allocation: bigint;
    quantity: bigint;
    originalSupply: bigint;
  }): bigint;
}
