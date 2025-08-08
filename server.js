const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

// Routes
const depositRoutes = require("./routes/deposit");
const testUserRoutes = require("./routes/testUser");
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
app.use(cors());
app.use(express.json());

// Connect to Database
connectDB();

// Default Route
app.get("/", (req, res) => {
  res.send("Server is running...");
});

// API Routes
app.use("/api/deposit", depositRoutes);
app.use("/api/test", testUserRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/investment", investmentRoutes); 
app.use("/api/user", userRoutes);
// app.use("/api/claim-roi", claimROIRoutes);
// app.use("/api/pending-roi", totalPendingROIRoutes);
app.use("/api/user", userSummaryRoutes);
app.use("/api/withdraw", withdrawalRoutes);
app.use("/api/disinvest", disinvestRoutes);
app.use("/api/roi", roiRoutes);       

// Start Background Jobs
startReturnJob();
startDepositMonitor();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
