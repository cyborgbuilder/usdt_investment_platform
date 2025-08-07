const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Withdrawal = require("../models/Withdrawal");
const Investment = require("../models/Investment");
const { ethers } = require("ethers");
const usdtABI = [
  "function transfer(address to, uint256 amount) public returns (bool)"
];

// POST /api/withdraw/:userId
router.post("/:userId", async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Calculate total ROI earned
    const roiTransactions = await Transaction.find({ userId: user._id, type: "roi" });
    const totalROI = roiTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    // Total withdrawable funds
    const totalFunds = user.balance + totalROI;

    if (amount > totalFunds) {
      return res.status(400).json({ msg: "Insufficient withdrawable funds" });
    }

    // Deduct from deposit balance first
    let remaining = amount;
    if (user.balance >= remaining) {
      user.balance -= remaining;
      remaining = 0;
    } else {
      remaining -= user.balance;
      user.balance = 0;
    }
    await user.save();

    // Deduct from ROI proportionally (mark transactions or track separately)
    // For MVP, we just log withdrawal and do not modify ROI logs

    // Create withdrawal record
    const withdrawal = await Withdrawal.create({
      userId: user._id,
      amount,
      status: "pending",
    });

    // Log transaction
    await Transaction.create({
      userId: user._id,
      txHash: `internal_withdraw_${Date.now()}`,
      type: "withdraw",
      amount,
      status: "pending",
      timestamp: new Date(),
    });

    res.json({ msg: "Withdrawal request created", withdrawal });
  } catch (error) {
    console.error("❌ Withdrawal Error:", error);
    res.status(500).send("Server Error");
  }
});

// GET /api/withdraw/:userId - fetch withdrawal history
router.get("/:userId", async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ userId: req.params.userId }).sort({ requestedAt: -1 });
    res.json(withdrawals);
  } catch (error) {
    console.error("❌ Error fetching withdrawals:", error);
    res.status(500).send("Server Error");
  }
});

router.post("/admin/:withdrawalId", async (req, res) => {
  try {
    const { action } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.withdrawalId);
    if (!withdrawal) return res.status(404).json({ msg: "Withdrawal not found" });

    if (withdrawal.status !== "pending") {
      return res.status(400).json({ msg: "This withdrawal has already been processed" });
    }

    if (action === "approve") {
      // ✅ Build full Alchemy URL
      const provider = new ethers.JsonRpcProvider(
        `https://sepolia.infura.io/v3/${process.env.ALCHEMY_URL}`
      );
      const wallet = new ethers.Wallet(process.env.MANAGEMENT_WALLET_PRIVATE_KEY, provider);

      const usdtContract = new ethers.Contract(
        process.env.USDT_CONTRACT,
        usdtABI,
        wallet
      );

      const userWalletAddress = req.body.userWalletAddress;
      if (!userWalletAddress) {
        return res.status(400).json({ msg: "User wallet address is required for withdrawal" });
      }

      const tx = await usdtContract.transfer(
        userWalletAddress,
        ethers.parseUnits(withdrawal.amount.toString(), 18)
      );
      await tx.wait();

      withdrawal.status = "approved";
      withdrawal.processedAt = new Date();
      await withdrawal.save();

      await Transaction.findOneAndUpdate(
        { userId: withdrawal.userId, type: "withdraw", amount: withdrawal.amount, status: "pending" },
        { status: "approved", txHash: tx.hash }
      );

      return res.json({ msg: "Withdrawal approved and USDT sent", txHash: tx.hash });
    }

    if (action === "reject") {
      withdrawal.status = "rejected";
      withdrawal.processedAt = new Date();
      await withdrawal.save();

      const user = await User.findById(withdrawal.userId);
      if (user) {
        user.balance += withdrawal.amount;
        await user.save();
      }

      await Transaction.findOneAndUpdate(
        { userId: withdrawal.userId, type: "withdraw", amount: withdrawal.amount, status: "pending" },
        { status: "rejected" }
      );

      return res.json({ msg: "Withdrawal rejected and refunded", withdrawal });
    }

    res.status(400).json({ msg: "Invalid action" });
  } catch (error) {
    console.error("❌ Admin withdrawal error:", error);
    res.status(500).send("Server Error");
  }
});

// Admin: Get all withdrawals or filter by status
router.get("/admin/all", async (req, res) => {
  try {
    const { status } = req.query; // optional: ?status=pending
    const query = status ? { status } : {};

    const withdrawals = await Withdrawal.find(query)
      .populate("userId", "username balance")
      .sort({ requestedAt: -1 });

    res.json(withdrawals);
  } catch (error) {
    console.error("❌ Admin fetch withdrawals error:", error);
    res.status(500).send("Server Error");
  }
});



module.exports = router;
