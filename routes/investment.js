const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const User = require("../models/User");
const Investment = require("../models/Investment");
const Transaction = require("../models/Transaction");

const usdtABI = [
  "function transfer(address to, uint256 amount) public returns (bool)"
];

// Create investment with on-chain USDT transfer
router.post("/:userId", async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.params.userId);

    if (!user || user.balance < amount) {
      return res.status(400).json({ msg: "Insufficient balance" });
    }

    if (!user.depositPrivateKey) {
      return res.status(400).json({ msg: "Deposit wallet not found for this user" });
    }

    // ✅ Deduct from DB balance
    user.balance -= amount;
    await user.save();

    // ✅ On-chain transfer: From user's deposit wallet → management wallet
    const provider = new ethers.JsonRpcProvider(
      `https://sepolia.infura.io/v3/${process.env.ALCHEMY_URL}`
    );

    const userWallet = new ethers.Wallet(user.depositPrivateKey, provider);
    const usdtContract = new ethers.Contract(
      process.env.USDT_CONTRACT,
      usdtABI,
      userWallet
    );

    const tx = await usdtContract.transfer(
      process.env.MANAGEMENT_WALLET_ADDRESS,
      ethers.parseUnits(amount.toString(), 18)
    );
    await tx.wait();

    // ✅ Create investment record
    const investment = new Investment({
      userId: user._id,
      amount,
      dailyRate: 0.01, // 1% daily
    });
    await investment.save();

    // ✅ Save transaction
    const transaction = new Transaction({
      userId: user._id,
      txHash: tx.hash, // now actual on-chain tx hash
      type: "investment",
      amount,
      status: "confirmed",
    });
    await transaction.save();

    res.json({ msg: "Investment successful and USDT transferred on-chain", investment, txHash: tx.hash });
  } catch (error) {
    console.error("❌ Investment error:", error);
    res.status(500).send("Server Error");
  }
});

// Get investments for a user
router.get("/:userId", async (req, res) => {
  try {
    const investments = await Investment.find({ userId: req.params.userId });
    res.json(investments);
  } catch (error) {
    console.error("❌ Get investments error:", error);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
