const express = require("express");
const Transaction = require("../models/Transaction");
const router = express.Router();

// Get all transactions for a user
router.get("/", async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.userId })
      .sort({ timestamp: -1 });
    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
