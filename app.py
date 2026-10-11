import os
from functools import lru_cache
from datetime import datetime
from io import BytesIO

import joblib
import pandas as pd
from flask import Flask, render_template, request, send_file, redirect, url_for, flash
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "change-this-for-local-demo")

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


@app.route("/", methods=["GET", "POST"])
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
        width, height = letter
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
        excluded = set(feature_names) - set(profile.keys())
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
    app.run(host="127.0.0.1", port=5000, debug=True)
