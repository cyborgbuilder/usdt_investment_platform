const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Investment = require("../models/Investment");
const Transaction = require("../models/Transaction");

// GET /api/user/:id/summary
router.get("/:userId/summary", async (req, res) => {
  try {
    const userId = req.params.userId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Total invested
    const investments = await Investment.find({ userId, status: "active" });
    const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);

    // Total ROI earned from transaction history
    const roiTransactions = await Transaction.find({ userId, type: "roi" });
    const totalROI = roiTransactions.reduce((sum, tx) => sum + tx.amount, 0);

    // Total value = withdrawable balance + invested funds + ROI earned
    const totalValue = user.balance + totalInvested + totalROI;

    res.json({
      userId,
      balance: user.balance,
      totalInvested,
      totalROI,
      totalValue
    });
  } catch (error) {
    console.error("Error fetching user summary:", error);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
