// services/investmentService.js
const Investment = require('../models/Investment');
const Wallet = require('../models/Wallet');

exports.createInvestment = async (userId, amount) => {
  const wallet = await Wallet.findOne({ userId });
  if (!wallet || wallet.balance < amount) {
    throw new Error('Insufficient wallet balance');
  }

  // Deduct funds
  wallet.balance -= amount;
  await wallet.save();

  const investment = new Investment({ userId, amount });
  return await investment.save();
};

exports.withdrawInvestment = async (userId, investmentId) => {
  const investment = await Investment.findOne({ _id: investmentId, userId });
  if (!investment) throw new Error('Investment not found');
  if (investment.status !== 'active') throw new Error('Already withdrawn');

  // Calculate total payout
  const totalPayout = investment.amount + investment.totalEarnings;

  // Update wallet balance
  const wallet = await Wallet.findOne({ userId });
  wallet.balance += totalPayout;
  await wallet.save();

  // Mark investment withdrawn
  investment.status = 'withdrawn';
  await investment.save();

  return { investment, totalPayout };
};
