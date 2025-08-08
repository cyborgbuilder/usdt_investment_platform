const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const User = require("../models/User");
const Investment = require("../models/Investment");
const Transaction = require("../models/Transaction");

const usdtABI = [
  "function transfer(address to, uint256 amount) public returns (bool)"
];

// POST /api/disinvest/:userId
router.post("/:userId", async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user || amount <= 0) {
      return res.status(400).json({ msg: "Invalid user or amount" });
    }

    const investments = await Investment.find({ userId: user._id, amount: { $gt: 0 } }).sort({ createdAt: 1 });

    let remaining = amount;
    for (let investment of investments) {
      if (remaining <= 0) break;

      const deduction = Math.min(investment.amount, remaining);
      investment.amount -= deduction;
      remaining -= deduction;
      await investment.save();
    }

    const disinvestedAmount = amount - remaining;
    if (disinvestedAmount <= 0) {
      return res.status(400).json({ msg: "No funds to disinvest" });
    }

    // ✅ On-chain transfer from management wallet to user's deposit address
    const provider = new ethers.JsonRpcProvider(`https://sepolia.infura.io/v3/${process.env.ALCHEMY_URL}`);
    const signer = new ethers.Wallet(process.env.MANAGEMENT_WALLET_PRIVATE_KEY, provider);
    const usdtContract = new ethers.Contract(process.env.USDT_CONTRACT, usdtABI, signer);

    const tx = await usdtContract.transfer(
      user.depositAddress,
      ethers.parseUnits(disinvestedAmount.toString(), 18)
    );
    await tx.wait();

    // ✅ Record disinvestment transaction
    const record = new Transaction({
      userId: user._id,
      txHash: tx.hash,
      type: "disinvest",
      amount: disinvestedAmount,
      status: "confirmed",
    });
    await record.save();

    res.json({ msg: "Disinvestment successful", disinvestedAmount, txHash: tx.hash });

  } catch (err) {
    console.error("❌ Disinvestment error:", err);
    res.status(500).json({ msg: "Server Error", error: err.message });
  }
});

module.exports = router;
