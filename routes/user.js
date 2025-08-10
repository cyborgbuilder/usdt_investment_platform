const express = require("express");
const router = express.Router();
const User = require("../models/User");

// Get user balance
router.get("/balance", async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    res.json({ balance: user.balance });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
