const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../models/User");
const Investment = require("../models/Investment");
const Transaction = require("../models/Transaction");

// GET /api/user/summary
router.get("/summary", async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ msg: "Invalid userId" });
    }

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ msg: "User not found" });

    // active investments
    const investments = await Investment.find({ userId, status: "active" })
      .select("amount roi")
      .lean();

    const totalInvested = investments.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
    const currentlyClaimableROI = investments.reduce((sum, inv) => sum + Number(inv.roi || 0), 0);

    // cumulative claimed ROI (what actually got paid out)
    // if you don't have "claim-roi" in enum, switch to { type: "roi", action: "claim" }
    const claimedAgg = await Transaction.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), type: "claim-roi", status: "confirmed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalEarnedROI = claimedAgg[0]?.total || 0;

    // choose the correct balance field
    const balance = typeof user.depositBalance === "number" ? user.depositBalance : Number(user.balance || 0);

    // Total value the user sees in-app: deposit balance + invested principal + unclaimed ROI
    // (claimed ROI is already included in `balance`)
    const totalValue = balance + totalInvested + currentlyClaimableROI;

    return res.json({
      userId,
      balance,
      totalInvested,
      currentlyClaimableROI, // goes to 0 right after claim
      totalEarnedROI,        // lifetime claimed
      totalValue
    });
  } catch (error) {
    console.error("Error fetching user summary:", error);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
