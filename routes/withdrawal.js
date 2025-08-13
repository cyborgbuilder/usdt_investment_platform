const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Withdrawal = require("../models/Withdrawal");

const usdtABI = [
  "function transfer(address to, uint256 amount) public returns (bool)",
];

const TOKEN_DECIMALS = Number(process.env.TOKEN_DECIMALS || 6); // USDT mainnet = 6

// POST /api/withdraw  (user)
router.post("/", async (req, res) => {
  try {
    const { amount, userWalletAddress } = req.body;

    // Basic validations
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ msg: "Invalid amount" });
    }
    if (!userWalletAddress || !ethers.isAddress(userWalletAddress)) {
      return res.status(400).json({ msg: "A valid userWalletAddress is required" });
    }

    // Atomic deduction to avoid race conditions
    const user = await User.findOneAndUpdate(
      { _id: req.user.userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    );
    if (!user) {
      return res.status(400).json({ msg: "Insufficient deposit balance" });
    }

    // Create withdrawal tied to the provided wallet address
    const withdrawal = await Withdrawal.create({
      userId: user._id,
      amount,
      status: "pending",
      walletAddress: ethers.getAddress(userWalletAddress) // checksum format
    });

    // Create a transaction linked to this withdrawal
    await Transaction.create({
      userId: user._id,
      txHash: `internal_withdraw_${Date.now()}`,
      type: "withdraw",
      amount,
      status: "pending",
      withdrawalId: withdrawal._id, // <— link for safe lookup later
      timestamp: new Date(),
    });

    res.json({ msg: "Withdrawal request created", withdrawal });
  } catch (error) {
    console.error("❌ Withdrawal Error:", error);
    res.status(500).send("Server Error");
  }
});

// GET /api/withdraw  (user)
router.get("/", async (req, res) => {
  try {
    const withdrawals = await Withdrawal
      .find({ userId: req.user.userId })
      .sort({ requestedAt: -1 });
    res.json(withdrawals);
  } catch (error) {
    console.error("❌ Fetch error:", error);
    res.status(500).send("Server Error");
  }
});

// POST /api/withdraw/admin/:withdrawalId  (admin)
router.post("/admin/:withdrawalId", requireAdmin, async (req, res) => {
  try {
    const { action } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.withdrawalId);
    if (!withdrawal) return res.status(404).json({ msg: "Withdrawal not found" });
    if (withdrawal.status !== "pending") {
      return res.status(400).json({ msg: "This withdrawal has already been processed" });
    }

    if (action === "approve") {
      // Use walletAddress saved on the withdrawal (ignore any address in the request)
      const userWalletAddress = withdrawal.walletAddress;

      // ✅ Changed Sepolia to Mainnet
      const rpcUrl =
        process.env.RPC_URL || `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;
      const provider = new ethers.JsonRpcProvider(rpcUrl);

      const wallet = new ethers.Wallet(process.env.MANAGEMENT_WALLET_PRIVATE_KEY, provider);
      const usdtContract = new ethers.Contract(process.env.USDT_CONTRACT, usdtABI, wallet);

      // If you want to fetch decimals dynamically, uncomment and override TOKEN_DECIMALS:
      // const tokenDecimals = await usdtContract.decimals();

      const tx = await usdtContract.transfer(
        userWalletAddress,
        ethers.parseUnits(withdrawal.amount.toString(), TOKEN_DECIMALS)
      );
      await tx.wait();

      withdrawal.status = "approved";
      withdrawal.processedAt = new Date();
      await withdrawal.save();

      await Transaction.findOneAndUpdate(
        { withdrawalId: withdrawal._id, type: "withdraw", status: "pending" },
        { status: "approved", txHash: tx.hash }
      );

      return res.json({ msg: "Withdrawal approved and USDT sent", txHash: tx.hash });
    }

    if (action === "reject") {
      withdrawal.status = "rejected";
      withdrawal.processedAt = new Date();
      await withdrawal.save();

      // Refund user balance
      await User.findByIdAndUpdate(withdrawal.userId, { $inc: { balance: withdrawal.amount } });

      await Transaction.findOneAndUpdate(
        { withdrawalId: withdrawal._id, type: "withdraw", status: "pending" },
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
