const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

// Middleware
const { authenticateToken } = require("./middleware/auth.middleware");

// Routes
const depositRoutes = require("./routes/deposit");
const transactionRoutes = require("./routes/transactions");
const investmentRoutes = require("./routes/investment");
const userRoutes = require("./routes/user");
// const claimROIRoutes = require("./routes/claimROI");
// const totalPendingROIRoutes = require("./routes/totalPendingROI");
const userSummaryRoutes = require("./routes/userSummary");
const withdrawalRoutes = require("./routes/withdrawal");
const disinvestRoutes = require("./routes/disinvest");
const roiRoutes = require("./routes/roi");

// Services
const startDepositMonitor = require("./services/depositMonitor");
const startReturnJob = require("./services/returnJob");

dotenv.config();
const app = express();

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

// Connect to Database
connectDB();

// Default Route
app.get("/", (req, res) => {
  res.send("Server is running...");
});

// API Routes
app.use("/api/deposit", authenticateToken, depositRoutes);
app.use("/api/transactions", authenticateToken, transactionRoutes);
app.use("/api/investment", authenticateToken, investmentRoutes);
app.use("/api/user", authenticateToken, userRoutes);
// app.use("/api/claim-roi", claimROIRoutes);
// app.use("/api/pending-roi", totalPendingROIRoutes);
app.use("/api/user", authenticateToken, userSummaryRoutes);
app.use("/api/withdraw", authenticateToken, withdrawalRoutes);
app.use("/api/disinvest", authenticateToken, disinvestRoutes);
app.use("/api/roi", authenticateToken, roiRoutes);

// Start Background Jobs
startReturnJob();
startDepositMonitor();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
