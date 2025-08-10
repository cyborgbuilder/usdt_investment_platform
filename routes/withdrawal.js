const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Withdrawal = require("../models/Withdrawal");
const { requireAdmin } = require("../middleware/auth.middleware");
const usdtABI = [
  "function transfer(address to, uint256 amount) public returns (bool)"
];

// POST /api/withdraw
router.post("/", async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // ✅ Only allow withdrawal from deposit balance
    if (amount > user.balance) {
      return res.status(400).json({ msg: "Insufficient deposit balance" });
    }

    // Deduct immediately for safety (reversible on reject)
    user.balance -= amount;
    await user.save();

    const withdrawal = await Withdrawal.create({
      userId: user._id,
      amount,
      status: "pending",
    });

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

// GET /api/withdraw - Fetch user's withdrawal history
router.get("/", async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ userId: req.user.userId }).sort({ requestedAt: -1 });
    res.json(withdrawals);
  } catch (error) {
    console.error("❌ Fetch error:", error);
    res.status(500).send("Server Error");
  }
});

// POST /api/withdraw/admin/:withdrawalId - Admin approval/rejection
router.post("/admin/:withdrawalId", requireAdmin, async (req, res) => {
  try {
    const { action, userWalletAddress } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.withdrawalId);
    if (!withdrawal) return res.status(404).json({ msg: "Withdrawal not found" });

    if (withdrawal.status !== "pending") {
      return res.status(400).json({ msg: "This withdrawal has already been processed" });
    }

    if (action === "approve") {
      if (!userWalletAddress) {
        return res.status(400).json({ msg: "User wallet address required" });
      }

      const provider = new ethers.JsonRpcProvider(
        `https://sepolia.infura.io/v3/${process.env.ALCHEMY_URL}`
      );
      const wallet = new ethers.Wallet(process.env.MANAGEMENT_WALLET_PRIVATE_KEY, provider);
      const usdtContract = new ethers.Contract(process.env.USDT_CONTRACT, usdtABI, wallet);

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
router.get("/admin/all", requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const withdrawals = await Withdrawal.find(query)
      .populate("userId", "username balance")
      .sort({ requestedAt: -1 });
    res.json(withdrawals);
  } catch (error) {
    console.error("❌ Admin fetch error:", error);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
