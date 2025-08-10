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

// Config
const TOKEN_DECIMALS = Number(process.env.TOKEN_DECIMALS || 18); // USDT=6, test token=18
function toTokenUnits(amountFloat) {
  return ethers.parseUnits(Number(amountFloat).toFixed(TOKEN_DECIMALS), TOKEN_DECIMALS);
}

// POST /api/roi/claim
router.post("/claim", async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || !user.depositAddress) {
      return res.status(404).json({ msg: "User or deposit wallet not found" });
    }

    // Concurrency guard to prevent double-claim
    const locked = await User.findOneAndUpdate(
      { _id: user._id, isClaimingROI: { $ne: true } },
      { $set: { isClaimingROI: true } },
      { new: true }
    );
    if (!locked) {
      return res.status(409).json({ msg: "Claim already in progress" });
    }
    const clearLock = async () => {
      await User.updateOne({ _id: user._id }, { $unset: { isClaimingROI: "" } }).catch(() => {});
    };

    try {
      // Find investments with ROI > 0
      const investments = await Investment.find({ userId: user._id, roi: { $gt: 0 } }).select("_id roi").lean();
      const totalROI = investments.reduce((sum, inv) => sum + (Number(inv.roi) || 0), 0);

      if (totalROI <= 0) {
        await clearLock();
        return res.status(400).json({ msg: "No ROI to claim" });
      }

      // Blockchain transfer
      const provider = new ethers.JsonRpcProvider(`https://sepolia.infura.io/v3/${process.env.ALCHEMY_URL}`);
      const managementWallet = new ethers.Wallet(process.env.MANAGEMENT_WALLET_PRIVATE_KEY, provider);
      const usdt = new ethers.Contract(process.env.USDT_CONTRACT, usdtABI, managementWallet);

      const amountUnits = toTokenUnits(totalROI);
      if (amountUnits <= 0n) {
        await clearLock();
        return res.status(400).json({ msg: "Claim amount too small for token decimals" });
      }

      // Optional: ensure management wallet has enough tokens
      try {
        const bal = await usdt.balanceOf(await managementWallet.getAddress());
        if (bal < amountUnits) {
          await clearLock();
          return res.status(400).json({ msg: "Insufficient token balance in management wallet" });
        }
      } catch {
        // ignore if token doesn't implement balanceOf properly
      }

      const tx = await usdt.transfer(user.depositAddress, amountUnits);
      await tx.wait(1);

      // Reset ROI to 0 for claimed investments
      const ids = investments.map(i => i._id);
      await Investment.updateMany({ _id: { $in: ids } }, { $set: { roi: 0 } });

      // Credit to user's deposit balance (or fallback to balance)
      const depositField = "depositBalance" in user ? "depositBalance" : "balance";
      await User.updateOne({ _id: user._id }, { $inc: { [depositField]: totalROI } });

      // Log transaction
      await Transaction.create({
        userId: user._id,
        txHash: tx.hash,
        type: "claim-roi",
        amount: totalROI,
        status: "confirmed",
        timestamp: new Date()
      });

      await clearLock();

      res.json({
        msg: "ROI claimed and transferred successfully",
        amount: totalROI,
        decimals: TOKEN_DECIMALS,
        txHash: tx.hash
      });
    } catch (innerErr) {
      await clearLock();
      console.error("❌ ROI Claim Error:", innerErr);
      res.status(500).json({ msg: "Server error during ROI claim" });
    }
  } catch (err) {
    console.error("❌ ROI Claim Fatal:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
