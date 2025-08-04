const { ethers } = require("ethers");
const User = require("../models/User");
require("dotenv").config();

const abi = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

let provider;
let contract;

function startListener() {
  try {
    console.log("🔌 Connecting to Infura WebSocket...");

    provider = new ethers.WebSocketProvider(
      `wss://sepolia.infura.io/ws/v3/${process.env.ALCHEMY_URL}`
    );

    contract = new ethers.Contract(process.env.USDT_CONTRACT, abi, provider);

    console.log("✅ Deposit listener started. Waiting for events...");

    contract.on("Transfer", async (from, to, value) => {
      try {
        console.log(`💰 Transfer detected: ${value} tokens to ${to}`);

        const user = await User.findOne({ depositAddress: to });
        if (user) {
          const amount = Number(ethers.formatUnits(value, 18));
          user.balance += amount;
          await user.save();
          console.log(`✅ Credited ${amount} USDT to user ${user.username}`);
        }
      } catch (error) {
        console.error("❌ Error processing deposit:", error);
      }
    });

  } catch (error) {
    console.error("❌ Failed to start deposit monitor:", error);
    setTimeout(startListener, 5000);
  }
}

module.exports = startListener;
