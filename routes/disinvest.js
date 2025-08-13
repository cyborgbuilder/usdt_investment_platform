const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const User = require("../models/User");
const Investment = require("../models/Investment");
const Transaction = require("../models/Transaction");

const usdtABI = [
  "function transfer(address to, uint256 amount) public returns (bool)",
  "function balanceOf(address account) view returns (uint256)"
];

// CHANGED: default decimals 18 -> 6 (USDT on Ethereum mainnet)
const TOKEN_DECIMALS = Number(process.env.TOKEN_DECIMALS || 6); // 6 on real USDT
function toUnits(n) {
  return ethers.parseUnits(Number(n).toFixed(TOKEN_DECIMALS), TOKEN_DECIMALS);
}

// POST /api/disinvest/:userId
router.post("/:userId", async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user || !user.depositAddress) {
      return res.status(400).json({ msg: "Invalid user or missing deposit address" });
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ msg: "Invalid amount" });
    }

    // FIFO across investments with principal > 0
    const investments = await Investment.find({
      userId: user._id,
      amount: { $gt: 0 }
    }).sort({ createdAt: 1 });

    if (!investments.length) {
      return res.status(400).json({ msg: "No funds to disinvest" });
    }

    // Reduce principal (do not touch status to avoid enum issues)
    let remaining = amt;
    const touched = [];
    for (const inv of investments) {
      if (remaining <= 0) break;
      const deduction = Math.min(Number(inv.amount), remaining);
      if (deduction > 0) {
        inv.amount = Math.max(0, Number(inv.amount) - deduction); // principal only
        touched.push(inv);
        remaining -= deduction;
      }
    }

    const disinvestedAmount = amt - remaining;
    if (disinvestedAmount <= 0) {
      return res.status(400).json({ msg: "No funds to disinvest" });
    }

    // CHANGED: switch provider from Sepolia to Ethereum mainnet
    const provider = new ethers.JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.ALCHEMY_URL}`);
    const signer = new ethers.Wallet(process.env.MANAGEMENT_WALLET_PRIVATE_KEY, provider);
    const usdt = new ethers.Contract(process.env.USDT_CONTRACT, usdtABI, signer);

    // Optional: ensure wallet has enough tokens
    try {
      const bal = await usdt.balanceOf(await signer.getAddress());
      if (bal < toUnits(disinvestedAmount)) {
        return res.status(400).json({ msg: "Insufficient tokens in management wallet" });
      }
    } catch { /* some tokens may behave differently; ignore */ }

    const tx = await usdt.transfer(user.depositAddress, toUnits(disinvestedAmount));
    const receipt = await tx.wait(1);

    // Persist principal changes (amount only; no status change)
    for (const inv of touched) {
      await inv.save();
    }

    // Upsert transaction row; credit balance ONLY on first insert (idempotent)
    const up = await Transaction.updateOne(
      { txHash: receipt.hash },
      {
        $setOnInsert: {
          userId: user._id,
          type: "disinvest",
          amount: disinvestedAmount,
          status: "confirmed",
          timestamp: new Date()
        }
      },
      { upsert: true }
    );

    if (up.upsertedCount === 1) {
      // Monitor ignores mgmt wallet → we must credit here
      const depositField = typeof user.depositBalance === "number" ? "depositBalance" : "balance";
      await User.updateOne({ _id: user._id }, { $inc: { [depositField]: disinvestedAmount } });
    }
    // If upsertedCount !== 1, the row already exists (e.g., a retry) → do NOT credit again.

    return res.json({
      msg: "Disinvestment successful",
      disinvestedAmount,
      txHash: receipt.hash
    });

  } catch (err) {
    console.error("❌ Disinvestment error:", err);
    return res.status(500).json({ msg: "Server Error", error: err.message });
  }
});

module.exports = router;
