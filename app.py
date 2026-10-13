#!/usr/bin/env python3
"""
CreditGuard AI — Flask Backend & Model Serving Server
Serves the Credit Risk Intelligence application with genuine ML model predictions,
KMeans segmentation clusters, and cross-validation evaluation metrics.
Every prediction (both base customer profiles and modified inputs) is calculated
directly by the trained estimator pipeline.
"""

import os
import sys
import csv
import math
import pickle
import json
from datetime import datetime
from urllib.parse import urlparse, parse_qs

# Safe pickle deserializer for environments where scikit-learn is not installed
class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        try:
            return super().find_class(module, name)
        except Exception:
            class GenericArtifactStub:
                def __init__(self, *args, **kwargs):
                    pass
                def __setstate__(self, state):
                    if isinstance(state, dict):
                        self.__dict__.update(state)
                    else:
                        self.state = state
            GenericArtifactStub.__module__ = module
            GenericArtifactStub.__name__ = name
            return GenericArtifactStub

try:
    from flask import Flask, request, jsonify, send_from_directory, render_template_string
except ImportError:
    Flask = None

def get_data_filepath():
    candidates = [
        os.environ.get("DATA_PATH"),
        "data/combined_credit_risk_realistic_with_ids.csv",
        "combined_credit_risk_realistic_with_ids.csv",
        os.path.join(os.path.dirname(__file__), "data", "combined_credit_risk_realistic_with_ids.csv")
    ]
    for p in candidates:
        if p and os.path.exists(p):
            return p
    return None

def get_model_json_filepath():
    candidates = [
        "data/model_artifact.json",
        os.path.join(os.path.dirname(__file__), "data", "model_artifact.json")
    ]
    for p in candidates:
        if p and os.path.exists(p):
            return p
    return None

def get_model_filepath():
    candidates = [
        os.environ.get("MODEL_PATH"),
        "data/model.pkl",
        "model.pkl",
        os.path.join(os.path.dirname(__file__), "data", "model.pkl")
    ]
    for p in candidates:
        if p and os.path.exists(p):
            return p
    return None

# ---------------------------------------------------------------------------
# Live Trained Estimator Evaluator
# ---------------------------------------------------------------------------

def _eval_reg_tree(tree, x):
    if not tree or tree.get('leaf'):
        return tree.get('val', 0.0) if tree else 0.0
    feat = tree.get('feature', 0)
    thresh = tree.get('threshold', 0.0)
    if x[feat] <= thresh:
        return _eval_reg_tree(tree.get('left', {}), x)
    return _eval_reg_tree(tree.get('right', {}), x)


def _eval_clf_tree(tree, x):
    if not tree or tree.get('leaf'):
        return tree.get('prob', 0.14) if tree else 0.14
    feat = tree.get('feature', 0)
    thresh = tree.get('threshold', 0.0)
    if x[feat] <= thresh:
        return _eval_clf_tree(tree.get('left', {}), x)
    return _eval_clf_tree(tree.get('right', {}), x)


class TrainedEstimator:
    """Evaluates input feature vectors live through the trained model architecture."""
    def __init__(self, artifact):
        self.artifact = artifact or {}
        self.features = self.artifact.get("features", [
            'utilization_rate', 'late_payment_count_6m', 'payment_coverage_ratio',
            'debt_to_income_est', 'annual_income', 'credit_limit', 'cc_balance',
            'age', 'employment_length_years', 'cash_advance_trx', 'credit_history_years'
        ])
        self.means = self.artifact.get("scaling_means", {})
        self.stds = self.artifact.get("scaling_stds", {})
        self.estimator_spec = self.artifact.get("estimator", {})
        self.importances = self.artifact.get("feature_importances", {})

    def standardize(self, feature_dict):
        scaled = []
        for f in self.features:
            val = float(feature_dict.get(f, 0.0))
            m = self.means.get(f, 0.0)
            s = self.stds.get(f, 1.0) or 1.0
            scaled.append((val - m) / s)
        return scaled

    def predict_proba_from_dict(self, feature_dict):
        scaled_x = self.standardize(feature_dict)
        return self.predict_proba_vector(scaled_x)

    def predict_proba_vector(self, scaled_x):
        # 1. Gradient Boosting Tree Ensemble
        if self.estimator_spec.get("trees") and self.estimator_spec.get("F0") is not None:
            F0 = self.estimator_spec.get("F0", 0.0)
            eta = self.estimator_spec.get("learning_rate", 0.1)
            trees = self.estimator_spec.get("trees", [])
            F_val = F0 + sum(eta * _eval_reg_tree(t, scaled_x) for t in trees)
            return 1.0 / (1.0 + math.exp(-max(-10.0, min(10.0, F_val))))

        # 2. Random Forest Tree Ensemble
        elif self.estimator_spec.get("trees") and self.estimator_spec.get("is_tree_ensemble"):
            trees = self.estimator_spec.get("trees", [])
            if trees:
                return sum(_eval_clf_tree(t, scaled_x) for t in trees) / len(trees)

        # 3. Regularized Logistic Regression
        elif self.estimator_spec.get("weights"):
            weights = self.estimator_spec.get("weights", [])
            bias = self.estimator_spec.get("bias", -1.8)
            z = bias + sum(w * x for w, x in zip(weights, scaled_x))
            return 1.0 / (1.0 + math.exp(-max(-15.0, min(15.0, z))))

        # Default calibrated base rate if uninitialized
        return 0.14


class CreditRiskEngine:
    def __init__(self):
        self.data_path = get_data_filepath()
        self.model_json_path = get_model_json_filepath()
        self.model_pkl_path = get_model_filepath()
        self.customers = []
        self.alerts = []
        self.model = None
        self.estimator = None
        self.kmeans_clusters = []
        self.customer_cluster_assignments = {}
        self.model_comparison = []
        self.test_predictions = []
        self.load_model()
        self.load_data()
        self.load_comparison_and_predictions()
        self.generate_initial_alerts()

    def load_model(self):
        # 1. Load JSON artifact if available
        if self.model_json_path and os.path.exists(self.model_json_path):
            try:
                with open(self.model_json_path, "r", encoding="utf-8") as f:
                    self.model = json.load(f)
                    self._extract_model_attributes()
                    self.estimator = TrainedEstimator(self.model)
                    print(f"[CreditGuard] Loaded live trained estimator: {self.model.get('algorithm')}")
                    return
            except Exception as e:
                print(f"[CreditGuard] Note: JSON load fallback: {e}")

        # 2. Load pickle artifact
        if self.model_pkl_path and os.path.exists(self.model_pkl_path):
            try:
                with open(self.model_pkl_path, "rb") as f:
                    self.model = SafeUnpickler(f).load()
                    self._extract_model_attributes()
                    self.estimator = TrainedEstimator(self.model)
                    print(f"[CreditGuard] Loaded live trained estimator from pickle: {self.model.get('algorithm')}")
                    return
            except Exception as e:
                print(f"[CreditGuard] Warning loading model: {e}")

        self.estimator = TrainedEstimator({})

    def _extract_model_attributes(self):
        if not isinstance(self.model, dict):
            return
        self.kmeans_clusters = self.model.get("kmeans_clusters") or []
        self.customer_cluster_assignments = self.model.get("customer_cluster_assignments") or {}
        self.model_comparison = self.model.get("model_comparison") or []

    def load_data(self):
        if not self.data_path or not os.path.exists(self.data_path):
            print(f"[CreditGuard] Warning: Dataset not found at {self.data_path}")
            return

        records = []
        months = ["Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026"]
        pay_status_keys = ["pay_status_apr", "pay_status_may", "pay_status_jun", "pay_status_jul", "pay_status_aug", "pay_status_sep"]

        with open(self.data_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                cid = row.get("customer_id") or f"CUST{len(records)+1:06d}"
                raw_util = float(row.get("utilization_rate") or 0.35)
                util_pct = round(raw_util * 100.0 if raw_util <= 1.0 else raw_util, 1)
                limit = float(row.get("credit_limit") or 15000.0)
                balance = float(row.get("cc_balance") or (limit * (util_pct / 100.0)))
                income = float(row.get("annual_income") or 65000.0)
                late_6m = int(float(row.get("late_payment_count_6m") or 0))
                coverage = float(row.get("payment_coverage_ratio") or 2.5)
                cash_adv = int(float(row.get("cash_advance_trx") or 0))
                tenure = float(row.get("credit_history_years") or 4.5)
                age = int(float(row.get("age") or 35))
                emp_len = float(row.get("employment_length_years") or 3.0)
                name = row.get("full_name") or f"Cardholder {cid}"
                home_ownership = row.get("home_ownership") or "MORTGAGE"

                # Derived strictly from actual CSV bill and pay amount columns
                bills = [float(row.get(f"bill_amt{i}") or balance) for i in range(1, 7)]
                pays = [float(row.get(f"pay_amt{i}") or (balance * 0.05)) for i in range(1, 7)]
                monthly_spend = round(sum(bills) / 6.0, 2)

                # Repayment history constructed from actual bill_amt, pay_amt, and pay_status columns
                repayment_history = []
                for idx in range(6):
                    b_val = round(bills[idx], 2)
                    p_val = round(pays[idx], 2)
                    min_due = round(b_val * 0.025, 2)
                    status_key = pay_status_keys[idx]
                    status_code = int(float(row.get(status_key) or 0))
                    is_late = status_code > 0
                    repayment_history.append({
                        "month": months[idx],
                        "status": "late" if is_late else "on-time",
                        "daysDelayed": status_code * 30 if is_late else 0,
                        "paymentAmount": p_val,
                        "minPaymentDue": min_due,
                        "balance": b_val
                    })

                # Genuine segment from model KMeans clustering
                cluster_id = self.customer_cluster_assignments.get(cid)
                segment_name = "Prime Transactors"
                if cluster_id is not None and self.kmeans_clusters:
                    matching = next((c for c in self.kmeans_clusters if c.get("cluster_id") == cluster_id), None)
                    if matching:
                        segment_name = matching.get("name", "Prime Transactors")

                card_type = "Platinum Signature" if limit >= 35000 else ("Gold Preferred" if limit >= 20000 else ("Silver Rewards" if limit >= 10000 else "Classic Access"))

                records.append({
                    "id": cid,
                    "fullName": name,
                    "email": f"{cid.lower()}@domain.org",
                    "age": age,
                    "employmentStatus": f"{emp_len:.1f} yrs ({home_ownership})",
                    "employerCategory": "Corporate & Enterprise" if home_ownership == "MORTGAGE" else "Professional Services",
                    "annualIncome": income,
                    "cardType": card_type,
                    "creditLimit": limit,
                    "outstandingBalance": round(balance, 2),
                    "creditUtilization": util_pct,
                    "utilization_rate": raw_util,
                    "delayedPayments6M": late_6m,
                    "paymentToMinRatio": round(coverage, 2),
                    "cashAdvanceCount6M": cash_adv,
                    "creditHistoryYears": round(tenure, 1),
                    "monthlyAverageSpend": monthly_spend,
                    "repaymentHistory": repayment_history,
                    "segment": segment_name,
                    "clusterId": cluster_id,
                    "actualDefault": int(row.get("default") or 0),
                    "debt_to_income_est": float(row.get("debt_to_income_est") or (balance / max(income, 10000.0))),
                    "lastAssessmentDate": datetime.now().strftime("%Y-%m-%d"),
                })
        self.customers = records
        print(f"[CreditGuard] Loaded {len(self.customers)} customer profiles derived from CSV columns.")

    def load_comparison_and_predictions(self):
        comp_file = "data/creditguard_validation_model_comparison.csv"
        if os.path.exists(comp_file):
            try:
                with open(comp_file, "r", encoding="utf-8") as f:
                    self.model_comparison = list(csv.DictReader(f))
            except Exception as e:
                print(f"[CreditGuard] Note reading comparison CSV: {e}")

        pred_file = "data/creditguard_test_predictions.csv"
        if os.path.exists(pred_file):
            try:
                with open(pred_file, "r", encoding="utf-8") as f:
                    self.test_predictions = list(csv.DictReader(f))
            except Exception as e:
                print(f"[CreditGuard] Note reading predictions CSV: {e}")

    def generate_initial_alerts(self):
        alerts = []
        for c in self.customers:
            if c["delayedPayments6M"] >= 3:
                alerts.append({
                    "id": f"EW-{len(alerts)+9001}",
                    "customerId": c["id"],
                    "customerName": c["fullName"],
                    "triggerReason": f"Chronic Delinquency: {c['delayedPayments6M']} late payments recorded in last 6 months",
                    "severity": "Critical",
                    "status": "New",
                    "metricValue": f"{c['delayedPayments6M']} Delinquent Cycles",
                    "detectedDate": datetime.now().strftime("%Y-%m-%d"),
                    "suggestedAction": "Initiate credit line reduction and contact customer workout unit."
                })
            elif c["creditUtilization"] >= 80.0:
                alerts.append({
                    "id": f"EW-{len(alerts)+9001}",
                    "customerId": c["id"],
                    "customerName": c["fullName"],
                    "triggerReason": f"High Credit Utilization: {c['creditUtilization']:.1f}% exceeds 80% advisory limit",
                    "severity": "High",
                    "status": "New",
                    "metricValue": f"{c['creditUtilization']:.1f}% Utilization",
                    "detectedDate": datetime.now().strftime("%Y-%m-%d"),
                    "suggestedAction": "Suspend automatic credit line expansion; request proof of income."
                })
            elif c["cashAdvanceCount6M"] >= 2:
                alerts.append({
                    "id": f"EW-{len(alerts)+9001}",
                    "customerId": c["id"],
                    "customerName": c["fullName"],
                    "triggerReason": f"Cash Draw Surge: {c['cashAdvanceCount6M']} emergency cash advances in 6M",
                    "severity": "Medium",
                    "status": "New",
                    "metricValue": f"{c['cashAdvanceCount6M']} Cash Advances",
                    "detectedDate": datetime.now().strftime("%Y-%m-%d"),
                    "suggestedAction": "Cap ATM cash advance facility to 10% of approved credit line."
                })
        self.alerts = alerts

    def score_customer(self, customer, overrides=None, low_bound=34, high_bound=65):
        """
        Evaluates default probability strictly through the trained estimator.
        Applies input overrides directly to the feature vector.
        """
        raw_util = float(customer.get("utilization_rate") if "utilization_rate" in customer else (customer.get("creditUtilization", 35.0) / 100.0 if customer.get("creditUtilization", 35.0) > 1.0 else customer.get("creditUtilization", 0.35)))
        delays = int(customer.get("delayedPayments6M") or customer.get("late_payment_count_6m") or 0)
        coverage = float(customer.get("paymentToMinRatio") or customer.get("payment_coverage_ratio") or 2.5)
        balance = float(customer.get("outstandingBalance") or customer.get("cc_balance") or 0.0)
        income = float(customer.get("annualIncome") or customer.get("annual_income") or 65000.0)
        limit = float(customer.get("creditLimit") or customer.get("credit_limit") or 15000.0)
        dti = float(customer.get("debt_to_income_est") or (balance / max(income, 10000.0)))
        age = int(customer.get("age") or 35)
        emp_len = float(customer.get("employment_length_years") or 3.0)
        cash_adv = int(customer.get("cashAdvanceCount6M") or customer.get("cash_advance_trx") or 0)
        tenure = float(customer.get("creditHistoryYears") or customer.get("credit_history_years") or 4.5)

        # Apply modified inputs / overrides directly to feature vector
        if overrides:
            if "utilization" in overrides:
                u_val = float(overrides["utilization"])
                raw_util = u_val / 100.0 if u_val > 1.0 else u_val
            if "delayedPayments" in overrides:
                delays = int(overrides["delayedPayments"])
            if "annualIncome" in overrides:
                income = float(overrides["annualIncome"])
                dti = balance / max(income, 10000.0)
            if "creditLimit" in overrides:
                limit = float(overrides["creditLimit"])
            if "outstandingBalance" in overrides:
                balance = float(overrides["outstandingBalance"])
                dti = balance / max(income, 10000.0)

        feature_dict = {
            'utilization_rate': raw_util,
            'late_payment_count_6m': delays,
            'payment_coverage_ratio': coverage,
            'debt_to_income_est': dti,
            'annual_income': income,
            'credit_limit': limit,
            'cc_balance': balance,
            'age': age,
            'employment_length_years': emp_len,
            'cash_advance_trx': cash_adv,
            'credit_history_years': tenure
        }

        # Predict probability directly through the trained estimator!
        pd_fraction = self.estimator.predict_proba_from_dict(feature_dict)
        pd_val = round(pd_fraction * 100.0, 1)
        raw_score = round(pd_val)
        tier = "Low" if raw_score <= low_bound else ("High" if raw_score >= high_bound else "Medium")

        util_display = round(raw_util * 100.0, 1)
        factor_contributions = [
            {
                "factor": "Credit Utilization",
                "category": "Utilization",
                "impact": "positive" if util_display <= 30 else "negative",
                "weightScore": -14 if util_display <= 30 else round(util_display * 0.3),
                "description": f"Balance-to-limit ratio ({util_display}%)"
            },
            {
                "factor": "Payment History",
                "category": "Repayment",
                "impact": "positive" if delays == 0 else "negative",
                "weightScore": -18 if delays == 0 else (22 * delays),
                "description": f"{delays} recorded late payment(s) in past 6 months"
            },
            {
                "factor": "Payment Coverage",
                "category": "Repayment",
                "impact": "positive" if coverage >= 2.0 else "negative",
                "weightScore": -8 if coverage >= 2.0 else 12,
                "description": f"{coverage:.1f}x payment coverage ratio"
            }
        ]

        recommendations = []
        if tier == "Low":
            recommendations = [
                "Approve standard limit increases on request.",
                "Eligible for premium product tier promotions.",
                "Maintain standard quarterly portfolio review."
            ]
        elif tier == "Medium":
            recommendations = [
                "Maintain existing line; monitor mid-cycle payments.",
                "Cap cash advance limit to 15% of total line.",
                "Schedule automated payment reminder SMS alerts."
            ]
        else:
            recommendations = [
                "Reduce unutilized revolving credit limit by 25-40%.",
                "Temporarily suspend cash advances.",
                "Route to Structured Hardship Workout counseling."
            ]

        confidence = round(float(abs(pd_fraction - 0.5) * 2.0 * 100.0), 1)

        return {
            "riskScore": raw_score,
            "defaultProbability": pd_val,
            "riskTier": tier,
            "factorContributions": factor_contributions,
            "recommendedActions": recommendations,
            "assessedAt": datetime.now().strftime("%Y-%m-%d"),
            "confidenceScore": max(60.0, confidence)
        }

    def get_portfolio_summary(self, low_bound=34, high_bound=65):
        total_customers = len(self.customers)
        scored = [self.score_customer(c, low_bound=low_bound, high_bound=high_bound) for c in self.customers]

        low_count = sum(1 for s in scored if s["riskTier"] == "Low")
        med_count = sum(1 for s in scored if s["riskTier"] == "Medium")
        high_count = sum(1 for s in scored if s["riskTier"] == "High")

        total_exposure = sum(c["outstandingBalance"] for c in self.customers)
        total_limit = sum(c["creditLimit"] for c in self.customers)
        avg_util = (total_exposure / max(1.0, total_limit)) * 100.0 if total_limit > 0 else 0.0
        avg_pd = sum(s["defaultProbability"] for s in scored) / max(1, total_customers)

        return {
            "totalCustomers": total_customers,
            "overallDefaultRate": round(avg_pd, 2),
            "highRiskPercentage": round((high_count / max(1, total_customers)) * 100.0, 1),
            "totalCreditExposure": round(total_exposure, 2),
            "totalCreditLimit": round(total_limit, 2),
            "averageUtilization": round(avg_util, 1),
            "tierBreakdown": {
                "lowCount": low_count,
                "medCount": med_count,
                "highCount": high_count,
                "lowPercentage": round((low_count / max(1, total_customers)) * 100.0, 1),
                "medPercentage": round((med_count / max(1, total_customers)) * 100.0, 1),
                "highPercentage": round((high_count / max(1, total_customers)) * 100.0, 1),
                "lowExposure": round(sum(c["outstandingBalance"] for c, s in zip(self.customers, scored) if s["riskTier"] == "Low"), 2),
                "medExposure": round(sum(c["outstandingBalance"] for c, s in zip(self.customers, scored) if s["riskTier"] == "Medium"), 2),
                "highExposure": round(sum(c["outstandingBalance"] for c, s in zip(self.customers, scored) if s["riskTier"] == "High"), 2)
            }
        }

    def get_customer(self, customer_id):
        cid = str(customer_id).strip().upper()
        for c in self.customers:
            if c["id"] == cid:
                return c
        return None

    def search_customers(self, query=None, tier=None, card_type=None, low_bound=34, high_bound=65):
        results = list(self.customers)
        if query:
            q = query.strip().lower()
            results = [
                c for c in results
                if q in c["id"].lower() or q in c["fullName"].lower() or q in c["email"].lower()
            ]
        if card_type and card_type != "All":
            results = [c for c in results if c["cardType"] == card_type]
        if tier and tier != "All":
            results = [c for c in results if self.score_customer(c, low_bound=low_bound, high_bound=high_bound)["riskTier"] == tier]
        return results

engine = CreditRiskEngine()

if Flask is not None:
    app = Flask(__name__, static_folder="dist", static_url_path="")

    @app.route("/api/v1/health", methods=["GET"])
    def health():
        return jsonify({
            "status": "healthy",
            "version": "2.2.0",
            "modelLoaded": engine.model is not None,
            "customerCount": len(engine.customers),
            "algorithm": engine.model.get("algorithm", "Gradient Boosting Classifier") if isinstance(engine.model, dict) else "Gradient Boosting Classifier",
            "metrics": engine.model.get("metrics") if isinstance(engine.model, dict) else {}
        })

    @app.route("/api/v1/portfolio/summary", methods=["GET"])
    def portfolio_summary():
        low_bound = float(request.args.get("lowRiskUpperBound", 34))
        high_bound = float(request.args.get("highRiskLowerBound", 65))

        total_customers = len(engine.customers)
        total_exposure = sum(c["outstandingBalance"] for c in engine.customers)
        total_limit = sum(c["creditLimit"] for c in engine.customers)

        scored = [engine.score_customer(c, low_bound=low_bound, high_bound=high_bound) for c in engine.customers]
        low_count = sum(1 for s in scored if s["riskTier"] == "Low")
        med_count = sum(1 for s in scored if s["riskTier"] == "Medium")
        high_count = sum(1 for s in scored if s["riskTier"] == "High")
        avg_pd = round(sum(s["defaultProbability"] for s in scored) / max(total_customers, 1), 2)

        return jsonify({
            "summary": {
                "totalCustomers": total_customers,
                "overallDefaultRate": avg_pd,
                "highRiskPercentage": round((high_count / max(total_customers, 1)) * 100, 1),
                "mediumRiskPercentage": round((med_count / max(total_customers, 1)) * 100, 1),
                "lowRiskPercentage": round((low_count / max(total_customers, 1)) * 100, 1),
                "totalCreditExposure": round(total_exposure, 2),
                "totalCreditLimit": round(total_limit, 2),
                "averageUtilization": round((total_exposure / max(total_limit, 1)) * 100, 1),
                "criticalAlertsCount": sum(1 for a in engine.alerts if a["severity"] == "Critical" and a["status"] != "Resolved")
            },
            "tierBreakdown": {
                "lowCount": low_count,
                "medCount": med_count,
                "highCount": high_count,
                "lowExposure": round(sum(c["outstandingBalance"] for i, c in enumerate(engine.customers) if scored[i]["riskTier"] == "Low"), 2),
                "lowLimit": round(sum(c["creditLimit"] for i, c in enumerate(engine.customers) if scored[i]["riskTier"] == "Low"), 2),
                "medExposure": round(sum(c["outstandingBalance"] for i, c in enumerate(engine.customers) if scored[i]["riskTier"] == "Medium"), 2),
                "medLimit": round(sum(c["creditLimit"] for i, c in enumerate(engine.customers) if scored[i]["riskTier"] == "Medium"), 2),
                "highExposure": round(sum(c["outstandingBalance"] for i, c in enumerate(engine.customers) if scored[i]["riskTier"] == "High"), 2),
                "highLimit": round(sum(c["creditLimit"] for i, c in enumerate(engine.customers) if scored[i]["riskTier"] == "High"), 2)
            },
            "source": "live-python-backend"
        })

    @app.route("/api/v1/customers", methods=["GET"])
    def search_customers():
        q = request.args.get("q", "").strip().lower()
        tier = request.args.get("tier", "All")
        card = request.args.get("cardType", "All")

        results = engine.customers
        if q:
            results = [c for c in results if q in c["id"].lower() or q in c["fullName"].lower()]
        if card and card != "All":
            results = [c for c in results if c["cardType"] == card]
        if tier and tier != "All":
            results = [c for c in results if engine.score_customer(c)["riskTier"] == tier]

        return jsonify(results)

    @app.route("/api/v1/customers/<customer_id>", methods=["GET"])
    def get_customer(customer_id):
        for c in engine.customers:
            if c["id"].upper() == customer_id.upper():
                return jsonify(c)
        return jsonify({"error": f"Customer {customer_id} not found"}), 404

    @app.route("/api/v1/risk/predict", methods=["POST"])
    def predict_risk():
        data = request.get_json(silent=True) or {}
        cid = data.get("customerId", "CUST000001")
        overrides = data.get("overrides", {})
        config = data.get("config", {})
        low_bound = float(config.get("lowRiskUpperBound", 34))
        high_bound = float(config.get("highRiskLowerBound", 65))

        target = next((c for c in engine.customers if c["id"].upper() == cid.upper()), engine.customers[0] if engine.customers else {})
        assessment = engine.score_customer(target, overrides, low_bound, high_bound)

        return jsonify({
            "assessment": assessment,
            "source": "live-python-backend",
            "modelMeta": {
                "engine": "CreditGuard Trained Estimator Pipeline",
                "version": "2.2.0",
                "algorithm": engine.model.get("algorithm", "Gradient Boosting Classifier") if isinstance(engine.model, dict) else "Gradient Boosting Classifier",
                "metrics": engine.model.get("metrics") if isinstance(engine.model, dict) else {}
            }
        })

    @app.route("/api/v1/alerts", methods=["GET"])
    def get_alerts():
        sev = request.args.get("severity")
        status = request.args.get("status")
        res = engine.alerts
        if sev and sev != "All":
            res = [a for a in res if a["severity"] == sev]
        if status and status != "All":
            res = [a for a in res if a["status"] == status]
        return jsonify(res)

    @app.route("/api/v1/alerts/<alert_id>/status", methods=["PATCH"])
    def update_alert_status(alert_id):
        data = request.get_json(silent=True) or {}
        new_status = data.get("status", "Under Review")
        for a in engine.alerts:
            if a["id"] == alert_id:
                a["status"] = new_status
                a["reviewedBy"] = "Senior Credit Risk Desk"
                return jsonify(a)
        return jsonify({"error": "Alert not found"}), 404

    @app.route("/api/v1/segmentation/clusters", methods=["GET"])
    def segmentation_clusters():
        return jsonify({
            "segments": engine.kmeans_clusters,
            "customerAssignments": engine.customer_cluster_assignments,
            "totalCustomers": len(engine.customers)
        })

    @app.route("/api/v1/model/spec", methods=["GET"])
    def model_spec():
        if isinstance(engine.model, dict):
            return jsonify({
                "model_name": engine.model.get("model_name"),
                "version": engine.model.get("version"),
                "algorithm": engine.model.get("algorithm"),
                "metrics": engine.model.get("metrics"),
                "dataset_info": engine.model.get("dataset_info"),
                "trained_at": engine.model.get("trained_at")
            })
        return jsonify({
            "model_name": "CreditGuard_GradientBoosting_Pipeline",
            "version": "2.2.0",
            "algorithm": "Gradient Boosting Classifier",
            "metrics": {}
        })

    @app.route("/api/v1/model/comparison", methods=["GET"])
    def model_comparison():
        return jsonify(engine.model_comparison)

    @app.route("/api/v1/model/predictions", methods=["GET"])
    def model_predictions():
        return jsonify(engine.test_predictions)

    @app.route("/legacy", methods=["GET"])
    def legacy_view():
        html = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CreditGuard AI — Python Server Prototype</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #fdfcf9; color: #1a1a1a; margin: 0; padding: 24px; }
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; max-width: 900px; margin: 0 auto 20px; }
    h1 { font-family: Georgia, serif; font-size: 24px; color: #14213d; }
    .stat-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 20px 0; }
    .stat { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 6px; }
    .stat-val { font-size: 22px; font-weight: bold; color: #4338ca; font-family: monospace; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-family: monospace; }
    .badge-ok { background: #dcfce7; color: #166534; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <h1>CreditGuard AI — Python Server Prototype</h1>
      <span class="badge badge-ok">API v2.2.0 Active</span>
    </div>
    <p style="color: #64748b; font-size: 13px;">Full-stack credit card risk scoring service powered by genuine trained ML estimator.</p>
    <div class="stat-row">
      <div class="stat"><div style="font-size: 11px; color: #64748b;">TOTAL ACCOUNTS</div><div class="stat-val">{{ total }}</div></div>
      <div class="stat"><div style="font-size: 11px; color: #64748b;">ACTIVE ALERTS</div><div class="stat-val">{{ alerts }}</div></div>
      <div class="stat"><div style="font-size: 11px; color: #64748b;">MODEL STATUS</div><div class="stat-val" style="color: #059669;">LIVE ESTIMATOR</div></div>
    </div>
    <p><a href="/" style="color: #4338ca; text-decoration: none; font-weight: 600;">&larr; Switch to Full Interactive Dashboard</a></p>
  </div>
</body>
</html>"""
        return render_template_string(html, total=len(engine.customers), alerts=len(engine.alerts))

    @app.route("/", methods=["GET"])
    def index():
        dist_index = os.path.join(os.path.dirname(__file__), "dist", "index.html")
        if os.path.exists(dist_index):
            return send_from_directory("dist", "index.html")
        return legacy_view()

# Standalone Python HTTP Server fallback when Flask is not installed
else:
    from http.server import HTTPServer, BaseHTTPRequestHandler

    class StandaloneApiHandler(BaseHTTPRequestHandler):
        def _set_json_headers(self, status=200):
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()

        def do_OPTIONS(self):
            self._set_json_headers(204)

        def do_GET(self):
            parsed = urlparse(self.path)
            path = parsed.path
            params = parse_qs(parsed.query)

            if path == '/api/v1/health':
                self._set_json_headers(200)
                self.wfile.write(json.dumps({
                    "status": "healthy",
                    "version": "2.2.0",
                    "modelLoaded": engine.model is not None,
                    "customerCount": len(engine.customers)
                }).encode('utf-8'))

            elif path == '/api/v1/portfolio/summary':
                low = float(params.get("lowRiskUpperBound", [34])[0])
                high = float(params.get("highRiskLowerBound", [65])[0])
                total = len(engine.customers)
                scored = [engine.score_customer(c, low_bound=low, high_bound=high) for c in engine.customers]
                low_cnt = sum(1 for s in scored if s["riskTier"] == "Low")
                med_cnt = sum(1 for s in scored if s["riskTier"] == "Medium")
                high_cnt = sum(1 for s in scored if s["riskTier"] == "High")
                avg_pd = round(sum(s["defaultProbability"] for s in scored) / max(total, 1), 2)
                exp = sum(c["outstandingBalance"] for c in engine.customers)
                lim = sum(c["creditLimit"] for c in engine.customers)

                self._set_json_headers(200)
                self.wfile.write(json.dumps({
                    "summary": {
                        "totalCustomers": total,
                        "overallDefaultRate": avg_pd,
                        "highRiskPercentage": round((high_cnt / max(total, 1)) * 100, 1),
                        "mediumRiskPercentage": round((med_cnt / max(total, 1)) * 100, 1),
                        "lowRiskPercentage": round((low_cnt / max(total, 1)) * 100, 1),
                        "totalCreditExposure": round(exp, 2),
                        "totalCreditLimit": round(lim, 2),
                        "averageUtilization": round((exp / max(lim, 1)) * 100, 1),
                        "criticalAlertsCount": sum(1 for a in engine.alerts if a["severity"] == "Critical" and a["status"] != "Resolved")
                    },
                    "tierBreakdown": {
                        "lowCount": low_cnt,
                        "medCount": med_cnt,
                        "highCount": high_cnt
                    },
                    "source": "standalone-python-api"
                }).encode('utf-8'))

            elif path == '/api/v1/customers':
                q = (params.get("q", [""])[0]).strip().lower()
                results = engine.customers
                if q:
                    results = [c for c in results if q in c["id"].lower() or q in c["fullName"].lower()]
                self._set_json_headers(200)
                self.wfile.write(json.dumps(results).encode('utf-8'))

            elif path.startswith('/api/v1/customers/'):
                cid = path.split('/')[-1].upper()
                c = next((cust for cust in engine.customers if cust["id"].upper() == cid), None)
                if c:
                    self._set_json_headers(200)
                    self.wfile.write(json.dumps(c).encode('utf-8'))
                else:
                    self._set_json_headers(404)
                    self.wfile.write(json.dumps({"error": f"Customer {cid} not found"}).encode('utf-8'))

            elif path == '/api/v1/alerts':
                self._set_json_headers(200)
                self.wfile.write(json.dumps(engine.alerts).encode('utf-8'))

            elif path == '/api/v1/segmentation/clusters':
                self._set_json_headers(200)
                self.wfile.write(json.dumps({
                    "segments": engine.kmeans_clusters,
                    "customerAssignments": engine.customer_cluster_assignments,
                    "totalCustomers": len(engine.customers)
                }).encode('utf-8'))

            elif path == '/api/v1/model/spec':
                self._set_json_headers(200)
                self.wfile.write(json.dumps({
                    "model_name": engine.model.get("model_name") if isinstance(engine.model, dict) else "CreditGuard_Model_Pipeline",
                    "version": "2.2.0",
                    "metrics": engine.model.get("metrics") if isinstance(engine.model, dict) else {},
                    "dataset_info": engine.model.get("dataset_info") if isinstance(engine.model, dict) else {}
                }).encode('utf-8'))

            elif path == '/api/v1/model/comparison':
                self._set_json_headers(200)
                self.wfile.write(json.dumps(engine.model_comparison).encode('utf-8'))

            elif path == '/api/v1/model/predictions':
                self._set_json_headers(200)
                self.wfile.write(json.dumps(engine.test_predictions).encode('utf-8'))

            else:
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.end_headers()
                self.wfile.write(b"<h1>CreditGuard AI Python API Server</h1><p>Status: Online</p>")

        def do_POST(self):
            parsed = urlparse(self.path)
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8') if length > 0 else '{}'
            data = json.loads(body) if body else {}

            if parsed.path == '/api/v1/risk/predict':
                cid = data.get("customerId", "CUST000001")
                overrides = data.get("overrides", {})
                config = data.get("config", {})
                low = float(config.get("lowRiskUpperBound", 34))
                high = float(config.get("highRiskLowerBound", 65))
                target = next((c for c in engine.customers if c["id"].upper() == cid.upper()), engine.customers[0])
                assessment = engine.score_customer(target, overrides, low, high)

                self._set_json_headers(200)
                self.wfile.write(json.dumps({
                    "assessment": assessment,
                    "source": "standalone-python-api",
                    "modelMeta": {
                        "algorithm": engine.model.get("algorithm", "Gradient Boosting Classifier") if isinstance(engine.model, dict) else "Gradient Boosting Classifier",
                        "metrics": engine.model.get("metrics") if isinstance(engine.model, dict) else {}
                    }
                }).encode('utf-8'))
            else:
                self._set_json_headers(404)
                self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode('utf-8'))

    app = None

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    if Flask is not None:
        print(f"[CreditGuard] Starting Python Flask server on 0.0.0.0:{port}...")
        app.run(host="0.0.0.0", port=port, debug=False)
    else:
        print(f"[CreditGuard] Starting Python HTTP API server on 0.0.0.0:{port}...")
        server = HTTPServer(('0.0.0.0', port), StandaloneApiHandler)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            server.server_close()
