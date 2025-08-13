const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const User = require("../models/User");
const Investment = require("../models/Investment");
const Transaction = require("../models/Transaction");

const usdtABI = [
  "function transfer(address to, uint256 amount) public returns (bool)"
];

// 🔁 Utility: Fund gas if needed
const checkAndFundGas = async (targetAddress, provider) => {
  const balance = await provider.getBalance(targetAddress);
  const eth = parseFloat(ethers.formatEther(balance));

  if (eth < 0.001) {
    const managementWallet = new ethers.Wallet(process.env.MANAGEMENT_WALLET_PRIVATE_KEY, provider);
    const amount = ethers.parseEther("0.005");

    const tx = await managementWallet.sendTransaction({
      to: targetAddress,
      value: amount,
    });

    await tx.wait();
    console.log(`✅ Gas funded for ${targetAddress}`);
  } else {
    console.log(`ℹ️ Gas is sufficient: ${eth} ETH`);
  }
};

// 📌 Create investment with on-chain USDT transfer
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

    // ✅ Setup provider and wallet (CHANGED: Sepolia -> Mainnet)
    const provider = new ethers.JsonRpcProvider(
      `https://mainnet.infura.io/v3/${process.env.ALCHEMY_URL}`
    );
    const userWallet = new ethers.Wallet(user.depositPrivateKey, provider);

    // ✅ Ensure gas is available
    await checkAndFundGas(userWallet.address, provider);

    // ✅ USDT transfer (CHANGED: decimals 18 -> 6)
    const usdtContract = new ethers.Contract(
      process.env.USDT_CONTRACT,
      usdtABI,
      userWallet
    );

    const tx = await usdtContract.transfer(
      process.env.MANAGEMENT_WALLET_ADDRESS,
      ethers.parseUnits(amount.toString(), 6) // USDT uses 6 decimals on Ethereum mainnet
    );
    await tx.wait();

    // ✅ Record investment
    const investment = new Investment({
      userId: user._id,
      amount,
      dailyRate: 0.01,
    });
    await investment.save();

    // ✅ Log transaction
    const transaction = new Transaction({
      userId: user._id,
      txHash: tx.hash,
      type: "investment",
      amount,
      status: "confirmed",
    });
    await transaction.save();

    res.json({
      msg: "Investment successful and USDT transferred on-chain",
      investment,
      txHash: tx.hash
    });
  } catch (error) {
    console.error("❌ Investment error:", error);
    res.status(500).send("Server Error");
  }
});

// 🔎 Get all investments for a user
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
