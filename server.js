const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const depositRoutes = require("./routes/deposit");
const testUserRoutes = require("./routes/testUser");
const startDepositMonitor = require("./services/depositMonitor");





dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// Connect Database
connectDB();

app.get("/", (req, res) => {
  res.send("Server is running...");
});

app.use("/api/deposit", depositRoutes);


app.use("/api/test", testUserRoutes);

startDepositMonitor();


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
