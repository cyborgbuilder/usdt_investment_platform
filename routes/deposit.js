const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const User = require("../models/User");
const QRCode = require("qrcode");

const fundWallet = async (address) => {
  try {
    // ✅ Changed Sepolia to Mainnet
    const provider = new ethers.JsonRpcProvider(
      `https://mainnet.infura.io/v3/${process.env.ALCHEMY_URL}`
    );

    const wallet = new ethers.Wallet(process.env.MANAGEMENT_WALLET_PRIVATE_KEY, provider);

    // ✅ Keep same amount as before or adjust if you want (still 0.005 ETH here)
    const amountToSend = ethers.parseEther("0.005");

    const tx = await wallet.sendTransaction({
      to: address,
      value: amountToSend
    });

    await tx.wait();
    console.log(`✅ Auto-funded ${address} with ${ethers.formatEther(amountToSend)} ETH`);
  } catch (error) {
    console.error("❌ Error funding wallet:", error.message);
  }
};

router.post("/generate-wallet/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // ✅ If wallet already exists, return it
    if (user.depositAddress && user.depositPrivateKey) {
      const qr = await QRCode.toDataURL(user.depositAddress);
      return res.json({ address: user.depositAddress, qr });
    }

    // ✅ Create a new wallet
    const newWallet = ethers.Wallet.createRandom();

    // ✅ Store address + private key securely
    user.depositAddress = newWallet.address;
    user.depositPrivateKey = newWallet.privateKey; // 🚨 Encrypt in production
    await user.save();

    // ✅ Automatically fund with ETH for gas
    await fundWallet(newWallet.address);

    // ✅ Generate QR Code
    const qr = await QRCode.toDataURL(newWallet.address);

    res.json({ address: newWallet.address, qr });
  } catch (error) {
    console.error("❌ Wallet generation error:", error);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
