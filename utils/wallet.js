const { ethers } = require("ethers");
const User = require("../models/User");

async function assignHDWalletAddress(userId) {
  const hdNode = ethers.HDNodeWallet.fromPhrase(process.env.MASTER_MNEMONIC);

  // Create a numeric index from user ID
  const userIndex = parseInt(userId.slice(-6), 16) % 100000; 

  // Derive child wallet (no "m/" prefix)
  const derivedWallet = hdNode.deriveChild(userIndex);

  const user = await User.findById(userId);
  user.depositAddress = derivedWallet.address;
  user.privateKey = derivedWallet.privateKey; // optional
  await user.save();

  return derivedWallet.address;
}

module.exports = assignHDWalletAddress;
