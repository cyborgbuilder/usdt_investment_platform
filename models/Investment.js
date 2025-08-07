const mongoose = require("mongoose");

const InvestmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  dailyRate: { type: Number, default: 0.01 },
  startDate: { type: Date, default: Date.now },
  lastReturnDate: { type: Date, default: Date.now },
  status: { type: String, enum: ["active", "closed"], default: "active" },
});


module.exports = mongoose.model("Investment", InvestmentSchema);
