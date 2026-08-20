const pool = require("../db");

exports.calculateCreditScore = async (req, res) => {
    try {
        const farmerId = req.farmer.farmer_id;

        const farmerResult = await pool.query(
            `SELECT created_at
             FROM farmers
             WHERE id = $1`,
            [farmerId]
        );

        if (farmerResult.rows.length === 0) {
            return res.status(404).json({
                error: "Farmer not found"
            });
        }

        const createdAt = new Date(
            farmerResult.rows[0].created_at
        );
        const today = new Date();
        const monthsActive =
            (today - createdAt) /
            (1000 * 60 * 60 * 24 * 30);

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

        // 1. Farming history score
        let historyScore = 0;

        if (monthsActive >= 36) historyScore = 25;
        else if (monthsActive >= 24) historyScore = 20;
        else if (monthsActive >= 12) historyScore = 15;
        else if (monthsActive >= 6) historyScore = 10;
        else historyScore = 5;

        // 2. Production consistency score
        const recordCount = records.length;
        let consistencyScore = 0;

        if (recordCount === 1) consistencyScore = 5;
        else if (recordCount === 2) consistencyScore = 10;
        else if (recordCount <= 4) consistencyScore = 15;
        else if (recordCount <= 6) consistencyScore = 20;
        else consistencyScore = 25;

        // 3. Economic capacity score
        const totalValue = records.reduce(
            (sum, record) => sum + Number(record.estimated_value || 0),
            0
        );

        let economicScore = 0;

        if (totalValue > 3000000) economicScore = 20;
        else if (totalValue > 1500000) economicScore = 15;
        else if (totalValue > 750000) economicScore = 10;
        else economicScore = 5;

        // 4. Activity frequency score
        let activityScore = 0;

        if (recordCount === 1) activityScore = 2;
        else if (recordCount === 2) activityScore = 5;
        else if (recordCount <= 4) activityScore = 10;
        else activityScore = 15;

        // 5. Data confidence score
        let confidenceScore = 0;

        if (recordCount === 1) confidenceScore = 1;
        else if (recordCount === 2) confidenceScore = 3;
        else if (recordCount === 3) confidenceScore = 6;
        else if (recordCount <= 5) confidenceScore = 10;
        else confidenceScore = 15;

        const totalScore =
            historyScore +
            consistencyScore +
            economicScore +
            activityScore +
            confidenceScore;

        let rating = "High Risk";
        let riskLevel = "Very High";
        let confidence = "Very Low";
        let recommendedLoanLimit = 0;

        if (totalScore >= 90) {
            rating = "Excellent";
            riskLevel = "Very Low";
            confidence = "High";
            recommendedLoanLimit = Math.round(totalValue * 0.2);
        } else if (totalScore >= 75) {
            rating = "Very Good";
            riskLevel = "Low";
            confidence = "Moderate";
            recommendedLoanLimit = Math.round(totalValue * 0.15);
        } else if (totalScore >= 60) {
            rating = "Good";
            riskLevel = "Moderate";
            confidence = "Low";
            recommendedLoanLimit = Math.round(totalValue * 0.1);
        } else if (totalScore >= 40) {
            rating = "Fair";
            riskLevel = "High";
            confidence = "Very Low";
            recommendedLoanLimit = 0;
        } else {
            rating = "High Risk";
            riskLevel = "Very High";
            confidence = "Very Low";
            recommendedLoanLimit = 0;
        }

        let explanation = "The score is based on limited production history. Continue recording production over more seasons to strengthen your credit profile.";

        if (recordCount >= 6 && totalScore >= 75) {
            explanation = "Your score is supported by consistent production records over multiple seasons, which strengthens your farming credit profile.";
        } else if (recordCount >= 4) {
            explanation = "You have several production records; more consistency across seasons will help improve score reliability.";
        } else if (recordCount === 1) {
            explanation = "Only one production record is available. Add more records across future seasons to improve the score and confidence.";
        }

        await pool.query(
            `INSERT INTO credit_scores
             (farmer_id, score, rating)
             VALUES ($1, $2, $3)`,
            [farmerId, totalScore, rating]
        );

        res.status(200).json({
            totalScore,
            rating,
            riskLevel,
            confidence,
            recommendedLoanLimit,
            explanation,
            breakdown: {
                historyScore,
                consistencyScore,
                economicScore,
                activityScore,
                confidenceScore
            }
        });
    } catch (err) {
        console.error(err.message);

        res.status(500).json({
            error: "Server error"
        });
    }
};
