#!/usr/bin/env python3
"""Prove the independent payout model kills a shrinking-denominator mutation.
Run only in an isolated worktree. The source is restored even when Forge fails.
AI-assisted by OpenAI Codex.
"""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / "contracts/src/FeeStrip.sol"
original = source.read_text()
correct = "payout = FullMath.mulDiv(amount, s.soldUSDC, s.quantity);"
wrong = "payout = FullMath.mulDiv(amount, s.soldUSDC, s.claim.totalSupply());"
assert original.count(correct) == 1, "Mutation target moved; inspect before changing it"
try:
    source.write_text(original.replace(correct, wrong))
    result = subprocess.run(["forge", "test", "--match-contract", "FeeStripTest", "--match-test", "testNativeLifecycleSnapshotOracleLateCaptureTransferAndIndependentRedemption", "-vv"], cwd=root, text=True, capture_output=True)
finally:
    source.write_text(original)
failures = [line for line in result.stdout.splitlines() if "[FAIL:" in line]
if result.returncode == 0 or not failures or "original-Q independent model" not in failures[0]:
    print(result.stdout)
    print(result.stderr)
    raise SystemExit("Mutation was not killed by an executed accounting assertion")
print("KILLED: shrinking redemption denominator; production source restored")
print(failures[0])
