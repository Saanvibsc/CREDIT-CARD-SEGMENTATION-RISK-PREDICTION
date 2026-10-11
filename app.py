import os
import math
import secrets
import logging
from functools import lru_cache
from datetime import datetime
from io import BytesIO

import joblib
import pandas as pd
from flask import Flask, jsonify, render_template, request, send_file, send_from_directory, flash
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32)
if not os.environ.get("FLASK_SECRET_KEY"):
    logging.getLogger(__name__).warning(
        "FLASK_SECRET_KEY is not set; a temporary key will be generated for this process."
    )

# Keep creditguard_model.pkl and your CSV in the project folder,
# or set MODEL_PATH and DATA_PATH environment variables.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.environ.get("MODEL_PATH", os.path.join(BASE_DIR, "creditguard_model.pkl"))
DATA_PATH = os.environ.get(
    "DATA_PATH",
    os.path.join(BASE_DIR, "combined_credit_risk_realistic_with_ids.csv")
)

ID_CANDIDATES = ["customer_id", "customerid", "client_id", "id"]
TARGET_CANDIDATES = ["default", "defaulted", "default_flag", "default_payment", "loan_default", "is_default"]

model = None
df = None
feature_names = []
id_col = None
target_col = None
load_error = None
_portfolio_probabilities = None
_alert_statuses = {}

try:
    model = joblib.load(MODEL_PATH)
    df = pd.read_csv(DATA_PATH)
    feature_names = list(getattr(model, "feature_names_in_", []))
    id_col = next((c for c in ID_CANDIDATES if c in df.columns), None)
    target_col = next((c for c in TARGET_CANDIDATES if c in df.columns), None)

    if id_col is None:
        raise ValueError(f"No customer ID column found. Available columns: {df.columns.tolist()}")
    if not feature_names:
        raise ValueError("The saved model does not expose feature_names_in_. Configure its expected input columns explicitly.")
    missing = [c for c in feature_names if c not in df.columns]
    if missing:
        raise ValueError(f"Dataset is missing model features: {missing}")
except Exception as exc:
    load_error = str(exc)


def risk_category(probability):
    # Illustrative UI bands only; not official credit-score categories.
    if probability < 0.30:
        return "Low (illustrative)"
    if probability < 0.60:
        return "Medium (illustrative)"
    return "High (illustrative)"


def risk_indicators(row):
    """Simple review indicators; these do not alter the saved model output."""
    indicators = []
    utilization = row.get("utilization_rate")
    if pd.isna(utilization):
        balance, limit = row.get("cc_balance"), row.get("credit_limit")
        utilization = balance / limit if pd.notna(balance) and pd.notna(limit) and limit > 0 else None
    if utilization is not None and pd.notna(utilization) and utilization >= 0.70:
        indicators.append(("High credit utilisation", "Review balance and available credit."))

    late_payments = row.get("late_payment_count_6m")
    if pd.notna(late_payments) and late_payments >= 2:
        indicators.append(("Repeated late payments", "Review recent payment history and consider a payment reminder."))

    coverage = row.get("payment_coverage_ratio")
    if pd.notna(coverage) and coverage < 1.0:
        indicators.append(("Payments below billed amount", "Review repayment capacity and discuss suitable repayment options."))

    debt_ratio = row.get("debt_to_income_est")
    if pd.notna(debt_ratio) and debt_ratio >= 0.40:
        indicators.append(("Elevated estimated debt-to-income", "Review total obligations and affordability."))
    return indicators


@lru_cache(maxsize=1)
def segmentation_labels():
    """Create a complementary K-Means grouping from available numeric behavior fields."""
    candidates = [
        "utilization_rate", "payment_coverage_ratio", "cash_advance_share",
        "installment_purchase_share", "late_payment_count_6m", "avg_bill_6m",
        "avg_payment_6m", "debt_to_income_est", "account_activity_score",
        "payment_consistency_score", "cashflow_volatility", "spend_intensity",
    ]
    columns = [name for name in candidates if name in df.columns]
    if not columns or len(df) < 2:
        return None
    values = df[columns].apply(pd.to_numeric, errors="coerce")
    values = values.fillna(values.median()).fillna(0)
    scaled = StandardScaler().fit_transform(values)
    cluster_count = min(4, len(df))
    labels = KMeans(n_clusters=cluster_count, random_state=42, n_init=10).fit_predict(scaled)
    return pd.Series(labels, index=df.index)


def predict_row(row):
    features = row[feature_names].to_frame().T
    probabilities = model.predict_proba(features)[0]
    classes = list(model.named_steps["classifier"].classes_)
    if 1 not in classes:
        raise ValueError(f"Model class 1 (default) not found. Model classes: {classes}")
    default_probability = float(probabilities[classes.index(1)])
    return default_probability


def customer_profile(customer_id):
    # Treat IDs as labels: trim accidental surrounding whitespace and ignore
    # case while preserving significant characters such as leading zeroes.
    requested_id = str(customer_id).strip().casefold()
    matches = df[df[id_col].astype(str).str.strip().str.casefold() == requested_id]
    if matches.empty:
        # Accept shortened CUST numeric IDs (for example CUST001) only when
        # they uniquely identify an ID present in the CSV.
        requested = str(customer_id).strip()
        if requested[:4].casefold() == "cust" and requested[4:].isdigit():
            requested_number = requested[4:].lstrip("0") or "0"
            id_values = df[id_col].astype(str).str.strip()
            numeric_suffixes = id_values.str.extract(r"(?i)^cust(\d+)$", expand=False)
            suffix_numbers = numeric_suffixes.str.lstrip("0").replace("", "0")
            matches = df[suffix_numbers == requested_number]
            if len(matches) != 1:
                return None
    if matches.empty:
        return None
    row = matches.iloc[0]
    probability = predict_row(row)
    profile = row.to_dict()
    profile["default_probability_pct"] = round(probability * 100, 2)
    profile["risk_score"] = round(probability * 100, 1)
    profile["risk_category"] = risk_category(probability)
    profile["predicted_class"] = "Default" if probability >= 0.50 else "No default"
    profile["risk_indicators"] = risk_indicators(row)
    return profile


def portfolio_summary():
    total = int(len(df))
    historical_default_rate = None
    if target_col:
        target = pd.to_numeric(df[target_col], errors="coerce")
        if target.notna().any():
            historical_default_rate = round(float(target.mean()) * 100, 2)

    # Calculate model-predicted high-risk share from actual model outputs.
    # This is computed on all rows for a prototype and may take a few seconds.
    high_risk_pct = None
    try:
        probs = model.predict_proba(df[feature_names])
        classes = list(model.named_steps["classifier"].classes_)
        if 1 in classes:
            default_probs = probs[:, classes.index(1)]
            high_risk_pct = round(float((default_probs >= 0.60).mean()) * 100, 2)
    except Exception:
        high_risk_pct = None

    return {
        "total_customers": total,
        "historical_default_rate": historical_default_rate,
        "predicted_high_risk_pct": high_risk_pct,
        "credit_exposure": round(float(pd.to_numeric(df.get("total_credit_exposure"), errors="coerce").sum()), 2)
        if "total_credit_exposure" in df.columns else None,
    }


@lru_cache(maxsize=1)
def segmentation_summary():
    labels = segmentation_labels()
    if labels is None:
        return []
    counts = labels.value_counts().sort_index()
    return [{"name": f"Segment {int(label) + 1}", "count": int(count)} for label, count in counts.items()]


def _api_ready():
    if load_error:
        return jsonify({"error": f"Application setup error: {load_error}"}), 503
    return None


def _number(row, column, default=0.0):
    value = pd.to_numeric(row.get(column), errors="coerce")
    return float(value) if pd.notna(value) and math.isfinite(float(value)) else default


def _portfolio_default_probabilities():
    global _portfolio_probabilities
    if _portfolio_probabilities is None:
        probabilities = model.predict_proba(df[feature_names])
        classes = list(model.named_steps["classifier"].classes_)
        if 1 not in classes:
            raise ValueError(f"Model class 1 (default) not found. Model classes: {classes}")
        _portfolio_probabilities = probabilities[:, classes.index(1)]
    return _portfolio_probabilities


def _tier_for_probability(probability, config):
    score = probability * 100
    if score < config["lowRiskUpperBound"]:
        return "Low"
    if score >= config["highRiskLowerBound"]:
        return "High"
    return "Medium"


def _risk_config():
    values = request.args if request.method == "GET" else (request.get_json(silent=True) or {}).get("config", {})
    defaults = {
        "lowRiskUpperBound": 34,
        "highRiskLowerBound": 65,
        "utilizationAlertThreshold": 80,
        "consecutiveLateAlertThreshold": 2,
    }
    config = {}
    for key, default in defaults.items():
        value = values.get(key, default)
        try:
            value = float(value)
        except (TypeError, ValueError):
            raise ValueError(f"Risk configuration value {key} must be numeric.")
        if not math.isfinite(value) or value < 0 or value > 100:
            raise ValueError(f"Risk configuration value {key} must be between 0 and 100.")
        config[key] = value
    if config["lowRiskUpperBound"] >= config["highRiskLowerBound"]:
        raise ValueError("Low-risk threshold must be lower than high-risk threshold.")
    return config


def _customer_api_record(row, cluster_labels=None):
    customer_id = str(row[id_col])
    credit_limit = _number(row, "credit_limit")
    balance = _number(row, "cc_balance")
    utilization = _number(row, "utilization_rate")
    if utilization <= 1:
        utilization *= 100
    payment_status_columns = [
        name for name in (
            "pay_status_apr", "pay_status_may", "pay_status_jun",
            "pay_status_jul", "pay_status_aug", "pay_status_sep",
        ) if name in row.index
    ]
    history = []
    for column in payment_status_columns:
        status = _number(row, column)
        history.append({
            "month": column.removeprefix("pay_status_").upper(),
            "status": "on-time" if status <= 0 else "late-1-29d",
            "daysDelayed": 0 if status <= 0 else None,
            "paymentAmount": _number(row, f"pay_amt{len(history) + 1}"),
            "minPaymentDue": _number(row, "minimum_payments"),
            "balance": _number(row, f"bill_amt{len(history) + 1}"),
        })

    cluster = None
    if cluster_labels is not None:
        cluster = int(cluster_labels.loc[row.name]) + 1

    employment_length = row.get("employment_length_years")
    employment = (
        f"{_number(row, 'employment_length_years'):.1f} years recorded"
        if pd.notna(employment_length) else "Not recorded"
    )
    home_ownership = row.get("home_ownership")
    employer_category = (
        f"Home ownership: {home_ownership}" if pd.notna(home_ownership) else "Not recorded"
    )
    return {
        "id": customer_id,
        "fullName": customer_id,
        "email": "Not recorded",
        "age": int(_number(row, "age")),
        "employmentStatus": employment,
        "employerCategory": employer_category,
        "annualIncome": _number(row, "annual_income"),
        "cardType": "Not recorded",
        "creditLimit": credit_limit,
        "outstandingBalance": balance,
        "creditUtilization": utilization,
        "repaymentHistory": history,
        "delayedPayments6M": int(_number(row, "late_payment_count_6m")),
        "paymentToMinRatio": _number(row, "payment_coverage_ratio"),
        "cashAdvanceCount6M": int(_number(row, "cash_advance_trx")),
        "monthlyAverageSpend": _number(row, "purchases"),
        "creditHistoryYears": _number(row, "credit_history_years"),
        "inquiriesLast6M": None,
        "segment": f"Segment {cluster}" if cluster is not None else "Unassigned",
        "joinedDate": "Not recorded",
        "lastAssessmentDate": "Not recorded",
    }


def _find_customer_row(customer_id):
    profile = customer_profile(customer_id)
    if profile is None:
        return None
    matches = df[df[id_col].astype(str).str.strip().str.casefold() == str(profile[id_col]).strip().casefold()]
    return matches.iloc[0]


def _risk_assessment(row, probability, config):
    indicators = risk_indicators(row)
    utilization = _number(row, "utilization_rate")
    if utilization <= 1:
        utilization *= 100
    late_payments = int(_number(row, "late_payment_count_6m"))
    positives = []
    if utilization < 30:
        positives.append(f"Credit utilization is {utilization:.1f}%.")
    if late_payments == 0:
        positives.append("No late payments are recorded in the available six-month indicator.")
    return {
        "riskScore": round(probability * 100, 1),
        "defaultProbability": round(probability * 100, 2),
        "riskTier": _tier_for_probability(probability, config),
        "factorContributions": [],
        "positiveIndicators": positives,
        "negativeIndicators": [title for title, _ in indicators],
        "recommendedActions": [action for _, action in indicators],
        "assessedAt": datetime.now().isoformat(timespec="seconds"),
        "confidenceScore": None,
    }


def _make_alerts(severity_filter="All", status_filter="All"):
    ids = df[id_col].astype(str)
    positions = pd.Series(range(len(df)), index=df.index)
    balance = pd.to_numeric(df.get("cc_balance"), errors="coerce")
    credit_limit = pd.to_numeric(df.get("credit_limit"), errors="coerce")
    utilization = pd.to_numeric(df.get("utilization_rate"), errors="coerce")
    utilization = utilization.fillna(balance.div(credit_limit.where(credit_limit > 0)))
    utilization = utilization.where(utilization > 1, utilization * 100).fillna(0)
    late_payments = pd.to_numeric(df.get("late_payment_count_6m"), errors="coerce").fillna(0)
    payment_coverage = pd.to_numeric(df.get("payment_coverage_ratio"), errors="coerce")
    debt_to_income = pd.to_numeric(df.get("debt_to_income_est"), errors="coerce")

    candidate_frames = []

    def add_candidates(mask, alert_index, title, action, category, severities):
        selected = positions.loc[mask.fillna(False)]
        if selected.empty:
            return
        customer_ids = ids.iloc[selected.to_numpy()].to_numpy()
        selected_severities = (
            [severities[position] for position in selected.to_numpy()]
            if isinstance(severities, list) else [severities] * len(selected)
        )
        frame = pd.DataFrame({
            "row_position": selected.to_numpy(),
            "alert_index": alert_index,
            "customer_id": customer_ids,
            "trigger_reason": title,
            "trigger_category": category,
            "suggested_action": action,
            "severity": selected_severities,
        })
        if severity_filter != "All":
            frame = frame.loc[frame["severity"] == severity_filter]
        if not frame.empty:
            candidate_frames.append(frame)

    add_candidates(
        utilization >= 70, 0, "High credit utilisation",
        "Review balance and available credit.", "High Utilization",
        ["Critical" if value >= 90 else "High" for value in utilization],
    )
    add_candidates(
        late_payments >= 2, 1, "Repeated late payments",
        "Review recent payment history and consider a payment reminder.", "Late Payments",
        ["Critical" if value >= 4 else "High" for value in late_payments],
    )
    add_candidates(
        payment_coverage < 1, 2, "Payments below billed amount",
        "Review repayment capacity and discuss suitable repayment options.", "Repayment Trend",
        "Medium",
    )
    add_candidates(
        debt_to_income >= 0.40, 3, "Elevated estimated debt-to-income",
        "Review total obligations and affordability.", "Large Balance", "High",
    )

    if not candidate_frames:
        return []
    candidates = pd.concat(candidate_frames, ignore_index=True)
    candidates["alert_id"] = (
        candidates["customer_id"] + ":" + candidates["alert_index"].astype(str)
    )
    candidates["status"] = candidates["alert_id"].map(_alert_statuses).fillna("New")
    if status_filter != "All":
        candidates = candidates.loc[candidates["status"] == status_filter]
    if candidates.empty:
        return []

    severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    candidates["severity_order"] = candidates["severity"].map(severity_order)
    candidates = candidates.sort_values(
        ["severity_order", "customer_id", "alert_index"], kind="stable"
    ).head(500)

    alerts = []
    detected_date = datetime.now().date().isoformat()
    for candidate in candidates.itertuples(index=False):
        row = df.iloc[candidate.row_position]
        if candidate.alert_index == 0:
            utilization_value = _number(row, "utilization_rate")
            if utilization_value <= 1:
                utilization_value *= 100
            metric = f"{utilization_value:.1f}%"
        elif candidate.alert_index == 1:
            metric = f"{int(_number(row, 'late_payment_count_6m'))} in 6 months"
        elif candidate.alert_index == 2:
            metric = candidate.trigger_reason
        else:
            metric = f"{_number(row, 'debt_to_income_est'):.1%}"
        alerts.append({
            "id": candidate.alert_id,
            "customerId": candidate.customer_id,
            "customerName": candidate.customer_id,
            "triggerReason": candidate.trigger_reason,
            "triggerCategory": candidate.trigger_category,
            "severity": candidate.severity,
            "status": candidate.status,
            "detectedDate": detected_date,
            "metricValue": metric,
            "suggestedAction": candidate.suggested_action,
        })
    return alerts


def _alert_for_id(alert_id):
    try:
        customer_id, index_text = alert_id.rsplit(":", 1)
        alert_index = int(index_text)
    except ValueError:
        return None
    if alert_index not in range(4):
        return None
    row = _find_customer_row(customer_id)
    if row is None:
        return None

    indicator_titles = [
        "High credit utilisation",
        "Repeated late payments",
        "Payments below billed amount",
        "Elevated estimated debt-to-income",
    ]
    indicators = risk_indicators(row)
    indicator = next(
        ((title, action) for title, action in indicators if title == indicator_titles[alert_index]),
        None,
    )
    if indicator is None:
        return None
    title, action = indicator
    customer_id = str(row[id_col])
    utilization = pd.to_numeric(row.get("utilization_rate"), errors="coerce")
    if pd.isna(utilization):
        balance = _number(row, "cc_balance")
        limit = _number(row, "credit_limit")
        utilization = balance / limit if limit > 0 else 0
    if utilization <= 1:
        utilization *= 100
    late_payments = int(_number(row, "late_payment_count_6m"))
    if alert_index == 0:
        category = "High Utilization"
        severity = "Critical" if utilization >= 90 else "High"
        metric = f"{utilization:.1f}%"
    elif alert_index == 1:
        category = "Late Payments"
        severity = "Critical" if late_payments >= 4 else "High"
        metric = f"{late_payments} in 6 months"
    elif alert_index == 2:
        category, severity, metric = "Repayment Trend", "Medium", title
    else:
        category, severity = "Large Balance", "High"
        metric = f"{_number(row, 'debt_to_income_est'):.1%}"
    return {
        "id": alert_id,
        "customerId": customer_id,
        "customerName": customer_id,
        "triggerReason": title,
        "triggerCategory": category,
        "severity": severity,
        "status": _alert_statuses.get(alert_id, "New"),
        "detectedDate": datetime.now().date().isoformat(),
        "metricValue": metric,
        "suggestedAction": action,
    }


def _critical_alert_count():
    utilization = pd.to_numeric(df.get("utilization_rate"), errors="coerce")
    utilization_pct = utilization.where(utilization > 1, utilization * 100)
    late_payments = pd.to_numeric(df.get("late_payment_count_6m"), errors="coerce")
    return int((utilization_pct.ge(90).sum()) + (late_payments.ge(4).sum()))


@app.get("/api/v1/health")
def api_health():
    return jsonify({
        "status": "healthy" if not load_error else "unavailable",
        "version": "1.0.0",
        "modelLoaded": model is not None and df is not None and load_error is None,
    }), (200 if not load_error else 503)


@app.get("/api/v1/portfolio/summary")
def api_portfolio_summary():
    if error := _api_ready():
        return error
    try:
        config = _risk_config()
        probabilities = _portfolio_default_probabilities()
        tiers = [_tier_for_probability(float(value), config) for value in probabilities]
        target = pd.to_numeric(df[target_col], errors="coerce") if target_col else pd.Series(dtype=float)
        default_rate = float(target.mean() * 100) if target.notna().any() else 0.0
        credit_limit = pd.to_numeric(df["credit_limit"], errors="coerce").fillna(0)
        balance = pd.to_numeric(df.get("cc_balance"), errors="coerce").fillna(0)
        exposure = pd.to_numeric(df.get("total_credit_exposure"), errors="coerce").fillna(0)
        tier_data = {}
        for tier, key in (("Low", "low"), ("Medium", "med"), ("High", "high")):
            mask = pd.Series([value == tier for value in tiers], index=df.index)
            tier_data[f"{key}Count"] = int(mask.sum())
            tier_data[f"{key}Exposure"] = float(exposure[mask].sum())
            tier_data[f"{key}Limit"] = float(credit_limit[mask].sum())
        return jsonify({
            "summary": {
                "totalCustomers": int(len(df)),
                "overallDefaultRate": round(default_rate, 2),
                "highRiskPercentage": round((tiers.count("High") / len(tiers)) * 100, 1),
                "mediumRiskPercentage": round((tiers.count("Medium") / len(tiers)) * 100, 1),
                "lowRiskPercentage": round((tiers.count("Low") / len(tiers)) * 100, 1),
                "totalCreditExposure": float(exposure.sum()),
                "totalCreditLimit": float(credit_limit.sum()),
                "averageUtilization": round(float((balance.sum() / credit_limit.sum()) * 100), 1) if credit_limit.sum() else 0,
                "criticalAlertsCount": _critical_alert_count(),
            },
            "tierBreakdown": tier_data,
            "source": "live-ml-backend",
        })
    except (ValueError, KeyError) as exc:
        return jsonify({"error": str(exc)}), 400


@app.get("/api/v1/customers")
def api_customers():
    if error := _api_ready():
        return error
    try:
        config = _risk_config()
        query = request.args.get("q", "").strip().casefold()
        tier = request.args.get("tier", "All")
        probabilities = _portfolio_default_probabilities()
        labels = segmentation_labels()
        limit = min(max(int(request.args.get("limit", 500)), 1), 5000)
        ids = df[id_col].astype(str).str.casefold()
        matches = ids.str.contains(query, regex=False)
        if query:
            ownership = df["home_ownership"].astype(str).str.casefold() if "home_ownership" in df.columns else ids
            matches |= ownership.str.contains(query, regex=False)
        card_type = request.args.get("cardType", "All")
        if card_type != "All":
            matches &= card_type == "Not recorded"
        if tier != "All":
            matches &= pd.Series(
                [_tier_for_probability(float(value), config) == tier for value in probabilities],
                index=df.index,
            )
        positions = [position for position, matched in enumerate(matches) if matched][:limit]
        customers = [_customer_api_record(df.iloc[position], labels) for position in positions]
        return jsonify(customers)
    except (TypeError, ValueError, KeyError) as exc:
        return jsonify({"error": str(exc)}), 400


@app.get("/api/v1/customers/<path:customer_id>")
def api_customer(customer_id):
    if error := _api_ready():
        return error
    row = _find_customer_row(customer_id)
    if row is None:
        return jsonify({"error": "Customer ID not found."}), 404
    return jsonify(_customer_api_record(row, segmentation_labels()))


@app.post("/api/v1/risk/predict")
def api_risk_predict():
    if error := _api_ready():
        return error
    try:
        payload = request.get_json(silent=True) or {}
        customer_id = str(payload.get("customerId", "")).strip()
        if not customer_id:
            return jsonify({"error": "customerId is required."}), 400
        config = _risk_config()
        row = _find_customer_row(customer_id)
        if row is None:
            return jsonify({"error": "Customer ID not found."}), 404
        overrides = payload.get("overrides") or {}
        if not isinstance(overrides, dict):
            return jsonify({"error": "overrides must be an object."}), 400
        prediction_row = row.copy()
        if "utilization" in overrides:
            utilization = float(overrides["utilization"])
            if not math.isfinite(utilization) or not 0 <= utilization <= 100:
                return jsonify({"error": "utilization override must be between 0 and 100."}), 400
            ratio = utilization / 100
            if "utilization_rate" in prediction_row.index:
                prediction_row["utilization_rate"] = ratio
            if "cc_balance" in prediction_row.index:
                prediction_row["cc_balance"] = _number(row, "credit_limit") * ratio
            if "revolving_balance_ratio" in prediction_row.index:
                prediction_row["revolving_balance_ratio"] = ratio
        if "delayedPayments" in overrides:
            delayed = float(overrides["delayedPayments"])
            if not math.isfinite(delayed) or not 0 <= delayed <= 6 or delayed % 1:
                return jsonify({"error": "delayedPayments override must be an integer from 0 to 6."}), 400
            if "late_payment_count_6m" in prediction_row.index:
                prediction_row["late_payment_count_6m"] = delayed
        if "annualIncome" in overrides:
            income = float(overrides["annualIncome"])
            if not math.isfinite(income) or income <= 0:
                return jsonify({"error": "annualIncome override must be a positive number."}), 400
            prediction_row["annual_income"] = income
            if "loan_percent_income" in prediction_row.index:
                prediction_row["loan_percent_income"] = _number(row, "loan_amnt") / income
            if "debt_to_income_est" in prediction_row.index:
                prediction_row["debt_to_income_est"] = _number(row, "total_credit_exposure") / income
        probability = predict_row(prediction_row)
        return jsonify({
            "assessment": _risk_assessment(prediction_row, probability, config),
            "source": "live-ml-backend",
            "modelMeta": {
                "engine": "Scikit-learn",
                "version": "1.6",
                "algorithm": "Saved creditguard_model pipeline",
                "calibrated": False,
            },
        })
    except (TypeError, ValueError, KeyError) as exc:
        return jsonify({"error": str(exc)}), 400


@app.get("/api/v1/alerts")
def api_alerts():
    if error := _api_ready():
        return error
    severity = request.args.get("severity", "All")
    status = request.args.get("status", "All")
    return jsonify(_make_alerts(severity, status))


@app.patch("/api/v1/alerts/<path:alert_id>/status")
def api_update_alert(alert_id):
    if error := _api_ready():
        return error
    payload = request.get_json(silent=True) or {}
    status = payload.get("status")
    if status not in {"New", "Under Review", "Resolved"}:
        return jsonify({"error": "status must be New, Under Review, or Resolved."}), 400
    alert = _alert_for_id(alert_id)
    if alert is None:
        return jsonify({"error": "Alert ID not found."}), 404
    _alert_statuses[alert_id] = status
    alert["status"] = status
    return jsonify(alert)


@app.get("/api/v1/segmentation/clusters")
def api_segmentation():
    if error := _api_ready():
        return error
    labels = segmentation_labels()
    if labels is None:
        return jsonify({"error": "There are not enough numeric behavior fields to generate clusters."}), 422
    groups = []
    for label in sorted(labels.unique()):
        members = df.loc[labels == label]
        target = pd.to_numeric(members[target_col], errors="coerce") if target_col else pd.Series(dtype=float)
        limit = pd.to_numeric(members["credit_limit"], errors="coerce").fillna(0)
        balance = pd.to_numeric(members["cc_balance"], errors="coerce").fillna(0)
        utilization = (balance / limit.replace(0, float("nan")) * 100).fillna(0)
        name = f"Segment {int(label) + 1}"
        groups.append({
            "segment": name,
            "name": name,
            "tagline": "K-Means behavioral cluster",
            "description": "Cluster derived from the dataset's numeric payment and behavior indicators.",
            "typicalFinancialBehavior": "See the cluster averages and customer ledger for observed values.",
            "count": int(len(members)),
            "percentage": round(len(members) / len(df) * 100, 1),
            "avgUtilization": round(float(utilization.mean()), 1),
            "avgBalance": round(float(balance.mean()), 2),
            "avgIncome": round(float(pd.to_numeric(members["annual_income"], errors="coerce").mean()), 2),
            "avgCreditLimit": round(float(limit.mean()), 2),
            "defaultRate": round(float(target.mean() * 100), 2) if target.notna().any() else 0,
            "recommendedStrategy": "Review cohort behavior and model outputs before taking action.",
        })
    return jsonify({
        "segments": groups,
        "customers": [_customer_api_record(row, labels) for _, row in df.head(1000).iterrows()],
        "totalCustomers": int(len(df)),
    })


@app.route("/", methods=["GET"])
def frontend():
    dist_dir = os.path.join(BASE_DIR, "static", "dist")
    if os.path.isfile(os.path.join(dist_dir, "index.html")):
        return send_from_directory(dist_dir, "index.html")
    return render_template("index.html", load_error="React frontend has not been built yet. Run npm install and npm run build.")


@app.route("/legacy", methods=["GET", "POST"])
def index():
    customer = None
    searched_id = ""
    summary = None
    if load_error:
        return render_template("index.html", load_error=load_error)

    summary = portfolio_summary()
    segments = segmentation_summary()
    if request.method == "POST":
        searched_id = request.form.get("customer_id", "").strip()
        if searched_id:
            try:
                customer = customer_profile(searched_id)
                if customer is None:
                    flash(f"Customer ID {searched_id} was not found.", "error")
            except Exception as exc:
                flash(f"Could not predict for this customer: {exc}", "error")
    return render_template(
        "index.html",
        customer=customer,
        searched_id=searched_id,
        summary=summary,
        segments=segments,
        id_col=id_col,
        target_col=target_col,
        load_error=None,
    )


@app.get("/<path:frontend_path>")
def frontend_routes(frontend_path):
    if frontend_path.startswith(("api/", "static/", "report/")):
        return jsonify({"error": "Not found."}), 404
    dist_dir = os.path.join(BASE_DIR, "static", "dist")
    if os.path.isfile(os.path.join(dist_dir, "index.html")):
        return send_from_directory(dist_dir, "index.html")
    return jsonify({"error": "React frontend has not been built yet."}), 404


@app.route("/report/<path:customer_id>")
def report(customer_id):
    if load_error:
        return f"Application setup error: {load_error}", 500
    try:
        profile = customer_profile(customer_id)
        if profile is None:
            return "Customer ID not found.", 404

        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=letter)
        _, height = letter
        y = height - 55

        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(50, y, "CreditGuard AI — Customer Risk Report")
        y -= 28
        pdf.setFont("Helvetica", 10)
        pdf.drawString(50, y, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        y -= 24
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(50, y, f"Customer ID: {profile[id_col]}")
        y -= 24

        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(50, y, "Risk assessment (prototype)")
        y -= 18
        pdf.setFont("Helvetica", 10)
        lines = [
            f"Predicted default probability: {profile['default_probability_pct']:.2f}%",
            f"Prototype risk score: {profile['risk_score']:.1f}/100",
            f"Illustrative category: {profile['risk_category']}",
            f"Probability threshold for predicted class display: 50%",
            f"Predicted class at 50%: {profile['predicted_class']}",
        ]
        for line in lines:
            pdf.drawString(55, y, line)
            y -= 16

        y -= 8
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(50, y, "Early-warning indicators and review actions")
        y -= 18
        pdf.setFont("Helvetica", 9)
        indicators = profile["risk_indicators"] or [("No configured indicators triggered", "Continue routine account monitoring.")]
        for title, action in indicators:
            for line in (f"- {title}: {action}",):
                if y < 65:
                    pdf.showPage()
                    y = height - 55
                    pdf.setFont("Helvetica", 9)
                pdf.drawString(55, y, line[:105])
                y -= 14

        y -= 8
        pdf.setFont("Helvetica-Bold", 11)
        pdf.drawString(50, y, "Available customer profile fields")
        y -= 18
        pdf.setFont("Helvetica", 9)
        shown = 0
        for key, value in profile.items():
            if key in {"default_probability_pct", "risk_score", "risk_category", "predicted_class", "risk_indicators"}:
                continue
            if pd.isna(value):
                value = "Missing"
            line = f"{key}: {value}"
            if len(line) > 105:
                line = line[:102] + "..."
            if y < 65:
                pdf.showPage()
                y = height - 55
                pdf.setFont("Helvetica", 9)
            pdf.drawString(55, y, line)
            y -= 13
            shown += 1

        if y < 85:
            pdf.showPage()
            y = height - 55
        y -= 10
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(50, y, "Limitations")
        y -= 15
        pdf.setFont("Helvetica", 9)
        disclaimer = (
            "This is an educational prototype. The probability is a model estimate, "
            "not certainty or a lending decision. The 0–100 score is not an official "
            "CIBIL/FICO/credit-bureau score. Validate data quality, fairness, calibration, "
            "and regulatory requirements before any real-world use."
        )
        for chunk in [disclaimer[i:i+105] for i in range(0, len(disclaimer), 105)]:
            if y < 55:
                pdf.showPage()
                y = height - 55
                pdf.setFont("Helvetica", 9)
            pdf.drawString(50, y, chunk)
            y -= 13

        pdf.save()
        buffer.seek(0)
        return send_file(
            buffer,
            as_attachment=True,
            download_name=f"CreditGuard_Risk_Report_{customer_id}.pdf",
            mimetype="application/pdf",
        )
    except Exception as exc:
        return f"Could not generate report: {exc}", 500


if __name__ == "__main__":
    debug = os.environ.get("FLASK_DEBUG", "").strip().lower() in {"1", "true", "yes"}
    host = os.environ.get("HOST", "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    app.run(host=host, port=port, debug=debug, use_reloader=debug)
