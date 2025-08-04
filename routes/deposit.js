const express = require("express");
const assignWalletToUser = require("../utils/wallet");
const User = require("../models/User");
const QRCode = require("qrcode");

const router = express.Router();

// Generate wallet & return QR
router.post("/generate-wallet/:userId", async (req, res) => {
  try {
    let user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    let depositAddress = user.depositAddress;

    if (!depositAddress) {
      depositAddress = await assignWalletToUser(req.params.userId);
      // update local variable instead of fetching again
    }

    const qr = await QRCode.toDataURL(depositAddress);
    res.json({ address: depositAddress, qr });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});


module.exports = router;
