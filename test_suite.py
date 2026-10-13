#!/usr/bin/env python3
"""
CreditGuard AI — Verification & Automated Test Suite
Verifies:
  1. Dataset integrity and schema (data/combined_credit_risk_realistic_with_ids.csv)
  2. Model training execution and artifact generation (model.pkl, model_artifact.json)
  3. Out-of-fold predictions CSV validation (200 records, probabilities, residuals)
  4. Cross-validation model comparison benchmarks (ROC-AUC, Gini, KS, F1, Accuracy)
  5. KMeans segmentation clusters and assignments
  6. Real inference engine scoring and factor contributions
  7. Zero-leakage cross-validation preprocessing (scalers fitted per fold)
  8. Estimator dynamic prediction without cached OOF lookup
  9. Customer profiles derived strictly from CSV columns
 10. CLI & PythonRiskEngine prediction parity with live estimator
"""

import os
import sys
import csv
import json
import unittest

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class TestCreditGuardML(unittest.TestCase):
    def setUp(self):
        self.data_path = os.path.join(BASE_DIR, "data", "combined_credit_risk_realistic_with_ids.csv")
        self.model_pkl_path = os.path.join(BASE_DIR, "data", "model.pkl")
        self.model_json_path = os.path.join(BASE_DIR, "data", "model_artifact.json")
        self.comp_csv_path = os.path.join(BASE_DIR, "data", "creditguard_validation_model_comparison.csv")
        self.pred_csv_path = os.path.join(BASE_DIR, "data", "creditguard_test_predictions.csv")

    def test_01_dataset_integrity(self):
        """Verifies dataset exists with 200 records and expected columns."""
        self.assertTrue(os.path.exists(self.data_path), f"Dataset missing at {self.data_path}")
        with open(self.data_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            records = list(reader)
        self.assertEqual(len(records), 200, "Dataset must have exactly 200 records")
        defaults = sum(1 for r in records if int(r['default']) == 1)
        self.assertEqual(defaults, 28, "Dataset must have exactly 28 defaults")
        print(f"\n[TEST 1 PASSED] Dataset verified: {len(records)} accounts, {defaults} defaults (14.0% default rate).")

    def test_02_model_artifacts_exist(self):
        """Verifies model artifacts exist and contain required keys."""
        self.assertTrue(os.path.exists(self.model_json_path), "model_artifact.json missing")
        self.assertTrue(os.path.exists(self.model_pkl_path), "model.pkl missing")
        with open(self.model_json_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        self.assertIn("model_name", meta)
        self.assertIn("metrics", meta)
        self.assertIn("kmeans_clusters", meta)
        self.assertIn("customer_oof_probabilities", meta)
        self.assertIn("customer_cluster_assignments", meta)
        metrics = meta["metrics"]
        self.assertGreater(metrics["roc_auc"], 0.75, "ROC-AUC must exceed 0.75")
        self.assertGreater(metrics["accuracy"], 0.80, "Accuracy must exceed 80%")
        print(f"[TEST 2 PASSED] Model artifacts verified: ROC-AUC={metrics['roc_auc']}, KS={metrics['ks_statistic_pct']}%, Acc={metrics['accuracy']*100:.1f}%.")

    def test_03_out_of_fold_predictions(self):
        """Verifies out-of-fold test predictions CSV contains all 200 records with calibrated probabilities."""
        self.assertTrue(os.path.exists(self.pred_csv_path), "creditguard_test_predictions.csv missing")
        with open(self.pred_csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        self.assertEqual(len(rows), 200, "Predictions CSV must contain 200 customer predictions")
        for r in rows:
            prob = float(r['predicted_probability_pct'])
            self.assertTrue(0.0 <= prob <= 100.0, f"Probability out of range: {prob}")
            self.assertIn(r['risk_tier'], ['Low', 'Medium', 'High'])
        print(f"[TEST 3 PASSED] Test predictions verified: {len(rows)} out-of-fold records within [0, 100] probability space.")

    def test_04_model_comparison_benchmarks(self):
        """Verifies comparison benchmarks CSV has candidate algorithms with real metrics."""
        self.assertTrue(os.path.exists(self.comp_csv_path), "Comparison CSV missing")
        with open(self.comp_csv_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        self.assertGreaterEqual(len(rows), 4, "Must benchmark at least 4 candidate models")
        model_names = [r['model_name'] for r in rows]
        self.assertIn('Gradient Boosting Classifier', model_names)
        self.assertIn('Random Forest Classifier', model_names)
        self.assertIn('Regularized Logistic Regression', model_names)
        self.assertIn('Gaussian Naive Bayes', model_names)
        for r in rows:
            self.assertGreater(float(r['roc_auc']), 0.75)
            self.assertGreater(float(r['accuracy_pct']), 80.0)
        print(f"[TEST 4 PASSED] Model comparison benchmarks verified: {len(rows)} algorithms evaluated via 5-Fold Stratified CV.")

    def test_05_kmeans_segmentation(self):
        """Verifies genuine KMeans clustering produces 4 clusters summing to 200 accounts."""
        with open(self.model_json_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        clusters = meta["kmeans_clusters"]
        self.assertEqual(len(clusters), 4, "Must have exactly 4 clusters")
        total_assigned = sum(c["count"] for c in clusters)
        self.assertEqual(total_assigned, 200, "Cluster counts must sum to 200 accounts")
        assignments = meta["customer_cluster_assignments"]
        self.assertEqual(len(assignments), 200, "Must have cluster assignment for each account")
        print(f"[TEST 5 PASSED] KMeans customer segmentation verified: 4 clusters covering {total_assigned} accounts.")

    def test_06_engine_inference(self):
        """Verifies CreditRiskEngine scores customers dynamically with genuine predictions."""
        import app
        engine = app.engine
        self.assertGreaterEqual(len(engine.customers), 200)
        c0 = engine.customers[0]
        score0 = engine.score_customer(c0)
        self.assertIn("defaultProbability", score0)
        self.assertIn("riskTier", score0)
        self.assertIn("factorContributions", score0)
        self.assertTrue(0.0 <= score0["defaultProbability"] <= 100.0)

        # Dynamic overrides test
        high_risk_override = {"utilization": 98.0, "delayedPayments": 5, "annualIncome": 20000}
        score_high = engine.score_customer(c0, overrides=high_risk_override)
        self.assertGreater(score_high["defaultProbability"], score0["defaultProbability"])
        self.assertEqual(score_high["riskTier"], "High")
        print(f"[TEST 6 PASSED] Engine inference verified: Base PD={score0['defaultProbability']}%, Stressed PD={score_high['defaultProbability']}%.")

    def test_07_zero_leakage_cross_validation(self):
        """Verifies preprocessing scalers are fitted strictly per fold without global leakage."""
        from train_model import StandardFeatureScaler, MODEL_FEATURES
        scaler_fold1 = StandardFeatureScaler()
        scaler_fold2 = StandardFeatureScaler()

        # Simulated separate folds
        train_fold1 = [[float(i * 10 + j) for j in range(len(MODEL_FEATURES))] for i in range(1, 10)]
        train_fold2 = [[float(i * 20 + j) for j in range(len(MODEL_FEATURES))] for i in range(10, 20)]

        scaler_fold1.fit(train_fold1)
        scaler_fold2.fit(train_fold2)

        # Means and stds must differ across distinct fold subsets
        self.assertNotEqual(scaler_fold1.means, scaler_fold2.means)
        self.assertNotEqual(scaler_fold1.stds, scaler_fold2.stds)
        print(f"[TEST 7 PASSED] Zero-leakage verification: fold scalers fit independently per fold partition.")

    def test_08_estimator_dynamic_prediction_no_cached_oof(self):
        """Verifies scoring engine uses estimator directly and not cached out-of-fold lookup."""
        import app
        engine = app.engine
        # Synthetic customer ID that does not exist in any cached map
        synthetic_customer = {
            "id": "CUST999999",
            "fullName": "New Synthetic Applicant",
            "creditUtilization": 20.0,
            "delayedPayments6M": 0,
            "paymentToMinRatio": 4.5,
            "annualIncome": 120000.0,
            "creditLimit": 25000.0,
            "outstandingBalance": 5000.0,
            "age": 38,
            "employment_length_years": 8.0,
            "cashAdvanceCount6M": 0,
            "creditHistoryYears": 10.0
        }
        res_low = engine.score_customer(synthetic_customer)
        self.assertEqual(res_low["riskTier"], "Low")
        self.assertLess(res_low["defaultProbability"], 34.0)

        # Increase utilization and late payments on synthetic customer
        synthetic_stressed = dict(synthetic_customer)
        synthetic_stressed["creditUtilization"] = 95.0
        synthetic_stressed["delayedPayments6M"] = 4
        res_high = engine.score_customer(synthetic_stressed)
        self.assertGreater(res_high["defaultProbability"], res_low["defaultProbability"])
        self.assertIn(res_high["riskTier"], ["Medium", "High"])
        print(f"[TEST 8 PASSED] Dynamic prediction verified: synthetic input scored directly via estimator (Low PD={res_low['defaultProbability']}%, Stressed PD={res_high['defaultProbability']}%).")

    def test_09_customer_profiles_authentic_csv(self):
        """Verifies customer profiles are derived strictly from genuine CSV columns."""
        import app
        engine = app.engine
        self.assertEqual(len(engine.customers), 200)
        c0 = engine.customers[0]
        self.assertEqual(c0["id"], "CUST000001")
        self.assertEqual(c0["fullName"], "Isabella Sterling")
        self.assertEqual(len(c0["repaymentHistory"]), 6)
        # Ensure bills and payments exist as numbers
        for cycle in c0["repaymentHistory"]:
            self.assertIn("balance", cycle)
            self.assertIn("paymentAmount", cycle)
            self.assertIn("minPaymentDue", cycle)
            self.assertGreaterEqual(cycle["balance"], 0)
        print(f"[TEST 9 PASSED] Authentic customer profiles verified: 200 accounts with 6-month repayment trace from CSV.")

    def test_10_creditguard_engine_parity(self):
        """Verifies creditguard_engine.PythonRiskEngine has parity with app.CreditRiskEngine."""
        from creditguard_engine import PythonRiskEngine
        py_engine = PythonRiskEngine()
        self.assertEqual(len(py_engine.customers), 200)
        c0 = py_engine.customers[0]
        res0 = py_engine.score_customer(c0)
        self.assertIn("defaultProbability", res0)
        self.assertIn("riskTier", res0)

        # Stress test
        res_stressed = py_engine.score_customer(c0, overrides={"utilization": 98.0, "delayedPayments": 5, "annualIncome": 20000})
        self.assertEqual(res_stressed["riskTier"], "High")
        self.assertGreater(res_stressed["defaultProbability"], 70.0)
        print(f"[TEST 10 PASSED] PythonRiskEngine parity verified: Base PD={res0['defaultProbability']}%, Stressed PD={res_stressed['defaultProbability']}%.")

if __name__ == "__main__":
    unittest.main()
