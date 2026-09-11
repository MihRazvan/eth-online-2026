#!/usr/bin/env python3
"""Prove the independent payout model kills a shrinking-denominator mutation.
Run in a disposable copied project; the working source is never mutated.
AI-assisted by OpenAI Codex.
"""
from pathlib import Path
import subprocess
import shutil
import tempfile

root = Path(__file__).resolve().parents[2]
original = (root / "contracts/src/FeeStrip.sol").read_text()
correct = "payout = FullMath.mulDiv(amount, s.soldUSDC, s.quantity);"
wrong = "payout = FullMath.mulDiv(amount, s.soldUSDC, s.claim.totalSupply());"
assert original.count(correct) == 1, "Mutation target moved; inspect before changing it"
with tempfile.TemporaryDirectory(prefix="feestrip-mutation-") as directory:
    isolated = Path(directory)
    shutil.copy2(root / "foundry.toml", isolated / "foundry.toml")
    shutil.copytree(root / "contracts", isolated / "contracts", ignore=shutil.ignore_patterns("out", "cache"))
    shutil.copytree(root / "scripts/proof", isolated / "scripts/proof")
    source = isolated / "contracts/src/FeeStrip.sol"
    source.write_text(original.replace(correct, wrong))
    result = subprocess.run(["forge", "test", "--match-contract", "FeeStripTest", "--match-test", "testNativeLifecycleSnapshotOracleLateCaptureTransferAndIndependentRedemption", "-vv"], cwd=isolated, text=True, capture_output=True)
failures = [line for line in result.stdout.splitlines() if "[FAIL:" in line]
if result.returncode == 0 or not failures or "original-Q independent model" not in failures[0]:
    print(result.stdout)
    print(result.stderr)
    raise SystemExit("Mutation was not killed by an executed accounting assertion")
print("KILLED: shrinking redemption denominator; working source unchanged")
print(failures[0])
