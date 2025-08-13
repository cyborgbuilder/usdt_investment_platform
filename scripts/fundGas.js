const { ethers } = require("ethers");
require("dotenv").config();

async function fundWallet(targetAddress) {
  try {
    const provider = new ethers.JsonRpcProvider(
      `https://mainnet.infura.io/v3/${process.env.ALCHEMY_URL}` // CHANGED: sepolia -> mainnet
    );

    // ✅ Load management wallet
    const wallet = new ethers.Wallet(process.env.MANAGEMENT_WALLET_PRIVATE_KEY, provider);

    // ✅ Amount of ETH to send for gas (0.005 ETH = ~500k gas)
    const amountToSend = ethers.parseEther("0.005");

    // ✅ Send transaction
    const tx = await wallet.sendTransaction({
      to: targetAddress,
      value: amountToSend
    });

    await tx.wait();

    console.log(`✅ Sent ${ethers.formatEther(amountToSend)} ETH to ${targetAddress}`);
    console.log(`🔗 Tx Hash: ${tx.hash}`);
  } catch (error) {
    console.error("❌ Error funding wallet:", error.message);
  }
}

// Run the script with address arg: node scripts/fundGas.js 0xUserDepositWallet
const targetAddress = process.argv[2];
if (!targetAddress) {
  console.error("⚠️ Please provide a wallet address: node scripts/fundGas.js <ADDRESS>");
  process.exit(1);
}

fundWallet(targetAddress);
