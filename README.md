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
