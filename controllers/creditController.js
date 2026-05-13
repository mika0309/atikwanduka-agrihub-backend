const pool = require("../db");

exports.calculateCreditScore = async (req, res) => {
    try {
        const farmerId = req.farmer.farmer_id;

        const result = await pool.query(
            `SELECT *
             FROM production_records
             WHERE farmer_id = $1`,
            [farmerId]
        );

        const records = result.rows;

        if (records.length === 0) {
            return res.status(400).json({
                error: "No production records found"
            });
        }

        // 1. Number of records
        const recordCount = records.length;
        const recordScore = Math.min(recordCount * 5, 25);

        // 2. Estimated value score
        const totalValue = records.reduce(
            (sum, record) => sum + Number(record.estimated_value || 0),
            0
        );

        let valueScore = 5;

        if (totalValue > 3000000) valueScore = 25;
        else if (totalValue > 1000000) valueScore = 20;
        else if (totalValue > 500000) valueScore = 10;

        // 3. Harvest consistency
        const quantities = records.map((record) =>
            Number(record.quantity_harvested)
        );

        const maxQuantity = Math.max(...quantities);
        const minQuantity = Math.min(...quantities);
        const variation = maxQuantity - minQuantity;

        let consistencyScore = 25;

        if (variation > 1000) consistencyScore = 5;
        else if (variation > 500) consistencyScore = 15;

        // 4. Activity frequency
        const latestRecord = records
            .map((record) => new Date(record.recorded_at))
            .sort((a, b) => b - a)[0];

        const daysAgo =
            (new Date() - latestRecord) /
            (1000 * 60 * 60 * 24);

        let activityScore = 5;

        if (daysAgo <= 30) activityScore = 25;
        else if (daysAgo <= 90) activityScore = 15;

        const totalScore =
            recordScore +
            valueScore +
            consistencyScore +
            activityScore;

        let rating = "High Risk";

        if (totalScore >= 80) rating = "Excellent";
        else if (totalScore >= 60) rating = "Good";
        else if (totalScore >= 40) rating = "Moderate";

        await pool.query(
            `INSERT INTO credit_scores
             (farmer_id, score, rating)
             VALUES ($1, $2, $3)`,
            [
                farmerId,
                totalScore,
                rating
            ]
        );

        res.json({
            totalScore,
            rating,
            breakdown: {
                recordScore,
                valueScore,
                consistencyScore,
                activityScore
            }
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};
