# CreditGuard AI — Full-stack prototype

The React/Vite dashboard is bundled and served by the Flask application. Flask loads the saved Scikit-learn model and CSV, provides customer/portfolio/risk/alert/segmentation APIs, and retains the original server-rendered page at `/legacy`.

## Run the combined app

1. Create and activate a Python virtual environment.
2. Install backend dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
3. Install frontend dependencies (Node.js 20.19+):
   ```powershell
   npm install
   ```
4. Build the dashboard and start Flask:
   ```powershell
   npm run build
   python app.py
   ```
5. Open `http://127.0.0.1:5000`.

The included `creditguard_model.pkl` and `combined_credit_risk_realistic_with_ids.csv` are used by default. Set `MODEL_PATH` and `DATA_PATH` to override them.

## Frontend development

Run `python app.py` in one terminal and `npm run dev` in another, then open `http://127.0.0.1:3000`. Vite proxies `/api` requests to Flask.

## Deploy to Railway

1. Push this project directory to a GitHub repository, including `Dockerfile`, `package-lock.json`, `requirements.txt`, `creditguard_model.pkl`, and `combined_credit_risk_realistic_with_ids.csv`.
2. In Railway, create a project from the GitHub repository and deploy from the project root. Railway uses the Dockerfile to build the React assets and install/run Flask with Gunicorn.
3. Set `FLASK_SECRET_KEY` in the Railway service variables to a long, random secret. Do not commit the secret to Git.
4. Generate a Railway public domain and set the service health-check path to `/api/v1/health`.
5. Wait for the deployment health check to pass, then open the generated domain.

The container listens on Railway's injected `PORT`, binds to `0.0.0.0`, and runs one Gunicorn worker with four threads. Keeping one worker also keeps in-memory alert status updates consistent. The model and dataset are bundled into the container, so deploys use the versions checked into this project. For larger model/data artifacts, use stable external storage and configure `MODEL_PATH` and `DATA_PATH`.

## API

- `GET /api/v1/health`
- `GET /api/v1/portfolio/summary`
- `GET /api/v1/customers?q=...&tier=...`
- `GET /api/v1/customers/<customer_id>`
- `POST /api/v1/risk/predict`
- `GET /api/v1/alerts`
- `PATCH /api/v1/alerts/<alert_id>/status`
- `GET /api/v1/segmentation/clusters`

Customer search returns up to 500 matches by default (maximum 5,000); segmentation includes the first 1,000 ledger rows and full cluster summaries. The alerts endpoint returns at most 500 highest-severity alerts.

## Model and data notes

- The loaded model must expose its expected feature columns, and every feature must exist in the CSV.
- Class label `1` is treated as default.
- Risk score is predicted probability × 100. Display bands are configurable and are not official credit-bureau scores.
- K-Means clusters are calculated from available numeric behavioral fields; cluster names are neutral labels.
- This educational prototype does not persist alert statuses or include the saved model's feature-attribution artifact.
- Personal names, card products, joined dates, and bureau inquiry counts not present in the CSV are displayed as unavailable, not inferred.
- This is not a production banking or automated lending system.
---
# CREDIT-CARD-SEGMENTATION-RISK-PREDICTION
Credit card customer analytics project combining customer segmentation, default risk prediction, explainable AI, and early-warning risk scoring.
# Intelligent Credit Card Customer Analytics

### Segmentation, Default Risk Prediction & Early-Warning System

An end-to-end credit card customer analytics project focused on understanding customer segments, predicting default risk, and generating explainable early-warning insights.

## Project Overview

This project combines customer segmentation, machine learning, explainable AI, and risk scoring to build a data-driven credit risk analytics system.

The system analyzes customer characteristics to:

* Identify distinct customer segments using K-Means clustering
* Predict default risk using multiple machine learning models
* Explain model predictions using SHAP
* Convert predicted probabilities into interpretable risk scores and categories
* Analyze customer segment and risk patterns for actionable insights

## Project Workflow

```text
Raw Customer Data
       ↓
Feature Engineering
       ↓
Customer Segmentation
       ↓
K-Means Clustering
       ↓
Default Risk Prediction
       ↓
Model Comparison & Selection
       ↓
SHAP Explainability
       ↓
Probability Calibration
       ↓
Risk Score & Risk Category
       ↓
Segment × Risk Analysis
       ↓
Dashboard
```

## Key Components

### 1. Customer Segmentation

K-Means clustering is used to identify groups of customers with similar characteristics. Multiple cluster configurations are evaluated before selecting the final segmentation.

### 2. Default Risk Prediction

Multiple models are compared to predict customer default risk:

* Logistic Regression
* Random Forest
* XGBoost / HistGradientBoosting

Cross-validation and evaluation metrics are used for model selection.

### 3. Explainable AI

SHAP (SHapley Additive exPlanations) is used to understand which customer features contribute most to individual and overall risk predictions.

### 4. Risk Scoring

Predicted probabilities are calibrated and transformed into an interpretable 1–10 risk score and corresponding risk categories.

### 5. Segment × Risk Analysis

Customer segmentation and predicted risk are combined using `customer_id` to identify risk patterns across different customer segments.

## Outputs

The project produces:

* Customer segment assignments and profiles
* Default probability predictions
* Final selected prediction model
* SHAP-based feature explanations
* Calibrated probabilities
* 1–10 customer risk scores
* Risk categories
* Segment × risk analysis
* Dashboard-ready datasets

## Technologies Used

* Python
* Pandas
* NumPy
* Scikit-learn
* XGBoost
* SHAP
* Matplotlib
* Seaborn
* Jupyter Notebook

## Project Structure

```text
├── data/
│   └── credit_features_engineered.csv
│
├── src/
│   ├── features.py
│   └── ...
│
├── notebooks/
│   └── ...
│
├── HANDOFF_SPEC.md
├── column_policy.csv
└── README.md
```

## Project Team

This project was developed as a collaborative Business Analytics project, with separate workstreams for segmentation, prediction, explainability, risk scoring, and dashboard integration.

## Objective

The overall objective is to create an interpretable and actionable credit risk analytics system that can help identify customer segments, detect potential default risk early, and support data-driven decision-making.
