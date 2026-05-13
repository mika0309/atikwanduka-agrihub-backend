require("dotenv").config();

const express = require("express");
const cors = require("cors");

const farmerRoutes = require("./routers/farmerRouters");
const productionRoutes = require("./routers/productionRoutes");
const creditRoutes = require("./routers/creditRoutes");
const subsidyRoutes = require("./routers/subsidyRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/farmers", farmerRoutes);
app.use("/api/production", productionRoutes);
app.use("/api/credit", creditRoutes);
app.use("/api/subsidy", subsidyRoutes);

app.get("/", (req, res) => {
    res.send("Atikwanduka AgriHub API running...");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
