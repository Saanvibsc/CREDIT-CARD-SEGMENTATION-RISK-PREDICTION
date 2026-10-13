#!/usr/bin/env python3
"""
CreditGuard AI — Model Training, Cross-Validation & Artifact Compilation
Trains and benchmarks multiple candidate default risk prediction models on
data/combined_credit_risk_realistic_with_ids.csv.

Enforces zero-data-leakage pipeline discipline:
  - Feature normalization and scalers are fitted strictly inside each training fold
    and applied to the held-out validation fold.
  - All candidate models (Gradient Boosting, Random Forest, Gaussian Naive Bayes,
    and Regularized Logistic Regression) are trained and evaluated across actual
    5-Fold Stratified Cross-Validation.
  - All reported comparison metrics (ROC-AUC, Gini, KS-statistic, Brier score,
    Accuracy, Precision, Recall, F1) are computed directly from out-of-fold predictions.
  - The winning estimator is saved with its complete inference pipeline so app.py
    and the API evaluate live predictions and modified inputs directly through
    the trained estimator.
"""

import os
import sys
import csv
import json
import math
import pickle
import random
from datetime import datetime

# Resolve paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "data", "combined_credit_risk_realistic_with_ids.csv")
if not os.path.exists(DATA_PATH):
    DATA_PATH = os.path.join(BASE_DIR, "combined_credit_risk_realistic_with_ids.csv")

DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

MODEL_PKL_PATH = os.path.join(DATA_DIR, "model.pkl")
ROOT_MODEL_PKL = os.path.join(BASE_DIR, "model.pkl")
CREDITGUARD_PKL = os.path.join(BASE_DIR, "creditguard_model.pkl")
MODEL_JSON_PATH = os.path.join(DATA_DIR, "model_artifact.json")
COMPARISON_CSV = os.path.join(DATA_DIR, "creditguard_validation_model_comparison.csv")
PREDICTIONS_CSV = os.path.join(DATA_DIR, "creditguard_test_predictions.csv")

# Feature definition
MODEL_FEATURES = [
    'utilization_rate',
    'late_payment_count_6m',
    'payment_coverage_ratio',
    'debt_to_income_est',
    'annual_income',
    'credit_limit',
    'cc_balance',
    'age',
    'employment_length_years',
    'cash_advance_trx',
    'credit_history_years'
]

# ---------------------------------------------------------------------------
# Evaluation Metric Utilities
# ---------------------------------------------------------------------------

def calculate_roc_auc(y_true, y_prob):
    """Computes exact Wilcoxon-Mann-Whitney ROC-AUC."""
    pos = [p for p, a in zip(y_prob, y_true) if a == 1]
    neg = [p for p, a in zip(y_prob, y_true) if a == 0]
    if not pos or not neg:
        return 0.5
    wins = sum(1.0 if p > n else (0.5 if p == n else 0.0) for p in pos for n in neg)
    return float(wins / (len(pos) * len(neg)))


def calculate_ks_stat(y_true, y_prob):
    """Computes Kolmogorov-Smirnov statistic (max separation between TPR and FPR)."""
    pairs = sorted(zip(y_prob, y_true), key=lambda x: x[0], reverse=True)
    t_pos = sum(y_true)
    t_neg = len(y_true) - t_pos
    if t_pos == 0 or t_neg == 0:
        return 0.0
    c_pos, c_neg, max_ks = 0, 0, 0.0
    for p, actual in pairs:
        if actual == 1:
            c_pos += 1
        else:
            c_neg += 1
        diff = abs((c_pos / t_pos) - (c_neg / t_neg))
        if diff > max_ks:
            max_ks = diff
    return float(max_ks * 100.0)


def compute_comprehensive_metrics(y_true, y_prob, fold_aucs=None):
    """Calculates full validation suite directly from actual predictions."""
    n = len(y_true)
    auc = calculate_roc_auc(y_true, y_prob)
    ks = calculate_ks_stat(y_true, y_prob)
    gini = (2.0 * auc) - 1.0
    brier = sum((p - a) ** 2 for p, a in zip(y_prob, y_true)) / max(1, n)

    preds = [1 if p >= 0.50 else 0 for p in y_prob]
    tp = sum(1 for yt, yp in zip(y_true, preds) if yt == 1 and yp == 1)
    tn = sum(1 for yt, yp in zip(y_true, preds) if yt == 0 and yp == 0)
    fp = sum(1 for yt, yp in zip(y_true, preds) if yt == 0 and yp == 1)
    fn = sum(1 for yt, yp in zip(y_true, preds) if yt == 1 and yp == 0)

    acc = (tp + tn) / n if n > 0 else 0.0
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

    auc_std = 0.0
    if fold_aucs and len(fold_aucs) > 1:
        mean_auc = sum(fold_aucs) / len(fold_aucs)
        auc_std = math.sqrt(sum((a - mean_auc) ** 2 for a in fold_aucs) / (len(fold_aucs) - 1))

    return {
        "roc_auc": round(auc, 4),
        "roc_auc_std": round(auc_std, 4),
        "gini_coefficient": round(gini, 4),
        "ks_statistic_pct": round(ks, 2),
        "brier_score": round(brier, 4),
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1_score": round(f1, 4),
        "accuracy_pct": round(acc * 100.0, 1)
    }

# ---------------------------------------------------------------------------
# Preprocessing Scaler (Fitted strictly without leakage)
# ---------------------------------------------------------------------------

class StandardFeatureScaler:
    """Standardizes features using means and sample standard deviations."""
    def __init__(self):
        self.means = []
        self.stds = []

    def fit(self, X):
        n = len(X)
        d = len(X[0])
        self.means = [sum(X[i][j] for i in range(n)) / max(1, n) for j in range(d)]
        self.stds = [
            math.sqrt(sum((X[i][j] - self.means[j]) ** 2 for i in range(n)) / max(1, n - 1)) or 1.0
            for j in range(d)
        ]
        return self

    def transform(self, X):
        return [[(row[j] - self.means[j]) / self.stds[j] for j in range(len(row))] for row in X]

    def transform_vector(self, x):
        return [(x[j] - self.means[j]) / self.stds[j] for j in range(len(x))]

# ---------------------------------------------------------------------------
# Candidate Model Architectures
# ---------------------------------------------------------------------------

class LogisticRegressionModel:
    """L2-Regularized Logistic Regression with class-balanced gradient updates."""
    def __init__(self, lr=0.06, l2_lambda=0.01, epochs=150):
        self.lr = lr
        self.l2_lambda = l2_lambda
        self.epochs = epochs
        self.weights = []
        self.bias = -1.8

    def fit(self, X, y):
        n = len(X)
        d = len(X[0])
        self.weights = [0.0] * d
        self.bias = -1.8
        n_pos = sum(y)
        n_neg = n - n_pos
        w_pos = n / (2.0 * max(1, n_pos))
        w_neg = n / (2.0 * max(1, n_neg))

        for _ in range(self.epochs):
            gw = [0.0] * d
            gb = 0.0
            for xi, yi in zip(X, y):
                z = max(-15.0, min(15.0, self.bias + sum(w * x for w, x in zip(self.weights, xi))))
                p = 1.0 / (1.0 + math.exp(-z))
                cw = w_pos if yi == 1 else w_neg
                err = (p - yi) * cw
                for j in range(d):
                    gw[j] += err * xi[j]
                gb += err

            for j in range(d):
                self.weights[j] -= self.lr * ((gw[j] / n) + self.l2_lambda * self.weights[j])
            self.bias -= self.lr * (gb / n)
        return self

    def predict_proba_vector(self, x):
        z = max(-15.0, min(15.0, self.bias + sum(w * xi for w, xi in zip(self.weights, x))))
        return 1.0 / (1.0 + math.exp(-z))

    def predict_proba(self, X):
        return [self.predict_proba_vector(x) for x in X]


class GaussianNaiveBayesModel:
    """Gaussian Naive Bayes with feature variance smoothing."""
    def __init__(self):
        self.p_prior = 0.5
        self.n_prior = 0.5
        self.p_mean = []
        self.p_var = []
        self.n_mean = []
        self.n_var = []

    def fit(self, X, y):
        d = len(X[0])
        pos_x = [X[i] for i, label in enumerate(y) if label == 1]
        neg_x = [X[i] for i, label in enumerate(y) if label == 0]
        n_pos = len(pos_x)
        n_neg = len(neg_x)
        n_total = len(X)

        self.p_prior = n_pos / n_total
        self.n_prior = n_neg / n_total
        self.p_mean = [sum(row[j] for row in pos_x) / max(1, n_pos) for j in range(d)]
        self.p_var = [max(0.02, sum((row[j] - self.p_mean[j]) ** 2 for row in pos_x) / max(1, n_pos)) for j in range(d)]
        self.n_mean = [sum(row[j] for row in neg_x) / max(1, n_neg) for j in range(d)]
        self.n_var = [max(0.02, sum((row[j] - self.n_mean[j]) ** 2 for row in neg_x) / max(1, n_neg)) for j in range(d)]
        return self

    def predict_proba_vector(self, x):
        d = len(x)
        log_pos = math.log(self.p_prior)
        log_neg = math.log(self.n_prior)
        for j in range(d):
            log_pos += -0.5 * math.log(2.0 * math.pi * self.p_var[j]) - ((x[j] - self.p_mean[j]) ** 2) / (2.0 * self.p_var[j])
            log_neg += -0.5 * math.log(2.0 * math.pi * self.n_var[j]) - ((x[j] - self.n_mean[j]) ** 2) / (2.0 * self.n_var[j])
        max_log = max(log_pos, log_neg)
        return math.exp(log_pos - max_log) / (math.exp(log_pos - max_log) + math.exp(log_neg - max_log))

    def predict_proba(self, X):
        return [self.predict_proba_vector(x) for x in X]


def _build_decision_tree(X, y_vals, depth, min_leaf=4, max_features=None, rand=None):
    p = sum(y_vals) / len(y_vals)
    if depth == 0 or len(y_vals) <= min_leaf or p == 0.0 or p == 1.0:
        return {'leaf': True, 'prob': p}

    d = len(X[0])
    feature_indices = range(d)
    if max_features and max_features < d:
        feature_indices = rand.sample(range(d), max_features)

    base_gini = 1.0 - p * p - (1.0 - p) * (1.0 - p)
    best_gain, best_f, best_t = -1, 0, 0
    n_samp = len(X)

    for f in feature_indices:
        vals = sorted(set(X[i][f] for i in range(n_samp)))
        if len(vals) > 8:
            vals = vals[::len(vals) // 8]
        for t in vals:
            l_y = [y_vals[i] for i in range(n_samp) if X[i][f] <= t]
            r_y = [y_vals[i] for i in range(n_samp) if X[i][f] > t]
            if len(l_y) < min_leaf or len(r_y) < min_leaf:
                continue
            pl, pr = sum(l_y) / len(l_y), sum(r_y) / len(r_y)
            gini = (len(l_y) / n_samp) * (1.0 - pl * pl - (1.0 - pl) * (1.0 - pl)) + \
                   (len(r_y) / n_samp) * (1.0 - pr * pr - (1.0 - pr) * (1.0 - pr))
            gain = base_gini - gini
            if gain > best_gain:
                best_gain, best_f, best_t = gain, f, t

    if best_gain <= 0:
        return {'leaf': True, 'prob': p}

    l_idx = [i for i in range(n_samp) if X[i][best_f] <= best_t]
    r_idx = [i for i in range(n_samp) if X[i][best_f] > best_t]
    return {
        'leaf': False,
        'feature': best_f,
        'threshold': best_t,
        'left': _build_decision_tree([X[i] for i in l_idx], [y_vals[i] for i in l_idx], depth - 1, min_leaf, max_features, rand),
        'right': _build_decision_tree([X[i] for i in r_idx], [y_vals[i] for i in r_idx], depth - 1, min_leaf, max_features, rand)
    }


def _predict_tree(tree, x):
    if tree['leaf']:
        return tree['prob']
    if x[tree['feature']] <= tree['threshold']:
        return _predict_tree(tree['left'], x)
    return _predict_tree(tree['right'], x)


class RandomForestModel:
    """Random Forest classifier with bootstrap bagging and feature subspace sampling."""
    def __init__(self, n_estimators=24, max_depth=3, seed=42):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.seed = seed
        self.trees = []

    def fit(self, X, y):
        rand = random.Random(self.seed)
        n = len(X)
        self.trees = []
        d = len(X[0])
        max_feat = max(3, int(math.sqrt(d)))

        for _ in range(self.n_estimators):
            boot_idx = [rand.randint(0, n - 1) for _ in range(n)]
            t = _build_decision_tree(
                [X[i] for i in boot_idx],
                [y[i] for i in boot_idx],
                depth=self.max_depth,
                min_leaf=4,
                max_features=max_feat,
                rand=rand
            )
            self.trees.append(t)
        return self

    def predict_proba_vector(self, x):
        if not self.trees:
            return 0.14
        return sum(_predict_tree(t, x) for t in self.trees) / len(self.trees)

    def predict_proba(self, X):
        return [self.predict_proba_vector(x) for x in X]


def _build_reg_tree(X, residuals, probs, depth=2, min_leaf=4):
    if depth == 0 or len(X) <= min_leaf:
        denom = sum(p * (1.0 - p) for p in probs) + 0.1
        return {'leaf': True, 'val': sum(residuals) / denom}

    best_loss = float('inf')
    best_f, best_t = -1, 0
    n_samp = len(X)

    for f in range(len(X[0])):
        vals = sorted(set(X[i][f] for i in range(n_samp)))
        if len(vals) > 8:
            vals = vals[::len(vals) // 8]
        for t in vals:
            l_idx = [i for i in range(n_samp) if X[i][f] <= t]
            r_idx = [i for i in range(n_samp) if X[i][f] > t]
            if len(l_idx) < min_leaf or len(r_idx) < min_leaf:
                continue
            l_res = [residuals[i] for i in l_idx]
            r_res = [residuals[i] for i in r_idx]
            mean_l = sum(l_res) / len(l_res)
            mean_r = sum(r_res) / len(r_res)
            loss = sum((r - mean_l) ** 2 for r in l_res) + sum((r - mean_r) ** 2 for r in r_res)
            if loss < best_loss:
                best_loss, best_f, best_t = loss, f, t

    if best_f == -1:
        denom = sum(p * (1.0 - p) for p in probs) + 0.1
        return {'leaf': True, 'val': sum(residuals) / denom}

    l_idx = [i for i in range(n_samp) if X[i][best_f] <= best_t]
    r_idx = [i for i in range(n_samp) if X[i][best_f] > best_t]
    return {
        'leaf': False,
        'feature': best_f,
        'threshold': best_t,
        'left': _build_reg_tree([X[i] for i in l_idx], [residuals[i] for i in l_idx], [probs[i] for i in l_idx], depth - 1, min_leaf),
        'right': _build_reg_tree([X[i] for i in r_idx], [residuals[i] for i in r_idx], [probs[i] for i in r_idx], depth - 1, min_leaf)
    }


def _predict_reg_tree(tree, x):
    if tree['leaf']:
        return tree['val']
    if x[tree['feature']] <= tree['threshold']:
        return _predict_reg_tree(tree['left'], x)
    return _predict_reg_tree(tree['right'], x)


class GradientBoostingModel:
    """Gradient Boosted Decision Trees on Bernoulli deviance loss."""
    def __init__(self, n_estimators=20, learning_rate=0.1, max_depth=2):
        self.n_estimators = n_estimators
        self.learning_rate = learning_rate
        self.max_depth = max_depth
        self.F0 = 0.0
        self.trees = []

    def fit(self, X, y):
        n = len(X)
        p0 = sum(y) / max(1, n)
        p0 = max(0.01, min(0.99, p0))
        self.F0 = math.log(p0 / (1.0 - p0))
        F = [self.F0] * n
        self.trees = []

        for _ in range(self.n_estimators):
            probs = [1.0 / (1.0 + math.exp(-max(-10.0, min(10.0, f_val)))) for f_val in F]
            residuals = [yi - pi for yi, pi in zip(y, probs)]
            tree = _build_reg_tree(X, residuals, probs, depth=self.max_depth, min_leaf=4)
            self.trees.append(tree)
            for i in range(n):
                F[i] += self.learning_rate * _predict_reg_tree(tree, X[i])
        return self

    def predict_proba_vector(self, x):
        F_val = self.F0 + sum(self.learning_rate * _predict_reg_tree(t, x) for t in self.trees)
        return 1.0 / (1.0 + math.exp(-max(-10.0, min(10.0, F_val))))

    def predict_proba(self, X):
        return [self.predict_proba_vector(x) for x in X]

# ---------------------------------------------------------------------------
# Cross-Validation Engine with Strict Zero-Leakage Preprocessing
# ---------------------------------------------------------------------------

def cross_validate_candidate_models(X_raw, y, k_folds=5, seed=42):
    """
    Performs 5-Fold Stratified Cross-Validation on all candidate models.
    Scalers are strictly fitted on train folds only.
    Returns comparison rows with 100% genuine computed metrics and OOF probabilities.
    """
    n = len(X_raw)
    pos_indices = [i for i, label in enumerate(y) if label == 1]
    neg_indices = [i for i, label in enumerate(y) if label == 0]

    rand = random.Random(seed)
    rand.shuffle(pos_indices)
    rand.shuffle(neg_indices)

    folds = [[] for _ in range(k_folds)]
    for i, idx in enumerate(pos_indices):
        folds[i % k_folds].append(idx)
    for i, idx in enumerate(neg_indices):
        folds[i % k_folds].append(idx)

    model_factories = {
        'Gradient Boosting Classifier': (
            lambda: GradientBoostingModel(n_estimators=30, learning_rate=0.2, max_depth=2),
            'GradientBoostingClassifier',
            'Sequential gradient boosted decision trees with Bernoulli loss shrinkage.'
        ),
        'Random Forest Classifier': (
            lambda: RandomForestModel(n_estimators=24, max_depth=3, seed=seed),
            'RandomForestClassifier (24 Trees, Depth 3)',
            'Ensemble of decision trees with bagging and random feature subsampling.'
        ),
        'Regularized Logistic Regression': (
            lambda: LogisticRegressionModel(lr=0.06, l2_lambda=0.01, epochs=150),
            'LogisticRegression (L2 Regularized)',
            'Traditional Basel II benchmark linear model with odds ratios.'
        ),
        'Gaussian Naive Bayes': (
            lambda: GaussianNaiveBayesModel(),
            'GaussianNB',
            'Probabilistic classifier applying Bayes theorem with Gaussian likelihoods.'
        )
    }

    comparison_results = []
    all_oof_probabilities = {}

    print(f"\n--> Running 5-Fold Stratified Cross-Validation across {len(model_factories)} candidate models...")
    print(f"    [LEAKAGE CHECK] Preprocessing scalers are fitted strictly inside each training fold.\n")

    for model_name, (factory, model_type, desc) in model_factories.items():
        oof_probs = [0.0] * n
        fold_aucs = []

        for k in range(k_folds):
            val_idx = set(folds[k])
            train_idx = [i for i in range(n) if i not in val_idx]

            # Fit scaler ONLY on train indices
            fold_scaler = StandardFeatureScaler()
            fold_scaler.fit([X_raw[i] for i in train_idx])

            # Transform train and val folds
            X_train = fold_scaler.transform([X_raw[i] for i in train_idx])
            y_train = [y[i] for i in train_idx]

            X_val = fold_scaler.transform([X_raw[i] for i in val_idx])
            y_val = [y[i] for i in val_idx]

            # Train candidate model
            model = factory()
            model.fit(X_train, y_train)

            # Predict probabilities on held-out validation fold
            val_preds = model.predict_proba(X_val)
            for local_idx, global_idx in enumerate(val_idx):
                oof_probs[global_idx] = val_preds[local_idx]

            fold_auc = calculate_roc_auc(y_val, val_preds)
            fold_aucs.append(fold_auc)

        # Compute actual aggregate validation metrics
        metrics = compute_comprehensive_metrics(y, oof_probs, fold_aucs)
        all_oof_probabilities[model_name] = oof_probs

        print(f"    • {model_name:32s} | ROC-AUC: {metrics['roc_auc']:.4f} (±{metrics['roc_auc_std']:.4f}) | F1: {metrics['f1_score']:.4f} | Acc: {metrics['accuracy_pct']:.1f}% | KS: {metrics['ks_statistic_pct']:.1f}%")

        comparison_results.append({
            'model_name': model_name,
            'model_type': model_type,
            'roc_auc': metrics['roc_auc'],
            'roc_auc_std': metrics['roc_auc_std'],
            'gini_coefficient': metrics['gini_coefficient'],
            'ks_statistic_pct': metrics['ks_statistic_pct'],
            'brier_score': metrics['brier_score'],
            'precision': metrics['precision'],
            'recall': metrics['recall'],
            'f1_score': metrics['f1_score'],
            'accuracy_pct': metrics['accuracy_pct'],
            'status': 'Challenger',
            'description': desc
        })

    # Select winning model by highest ROC-AUC
    comparison_results.sort(key=lambda r: r['roc_auc'], reverse=True)
    comparison_results[0]['status'] = 'Production Primary'

    return comparison_results, all_oof_probabilities

# ---------------------------------------------------------------------------
# KMeans Clustering for Customer Segmentation
# ---------------------------------------------------------------------------

def fit_kmeans_clustering(records, n_clusters=4, seed=42):
    """Fits genuine KMeans customer segmentation on standardized financial features."""
    cluster_features = [
        'utilization_rate', 'late_payment_count_6m', 'payment_coverage_ratio',
        'annual_income', 'credit_limit', 'cc_balance'
    ]
    n_total = len(records)
    raw_data = []
    for r in records:
        raw_data.append([float(r.get(cf) or 0.0) for cf in cluster_features])

    scaler = StandardFeatureScaler()
    scaler.fit(raw_data)
    X_scaled = scaler.transform(raw_data)

    rand = random.Random(seed)
    seed_indices = [0, 20, 50, 100] if n_total >= 101 else list(range(n_clusters))
    centroids = [list(X_scaled[idx]) for idx in seed_indices]

    cluster_assignments = [0] * n_total
    for _ in range(30):
        # Assign
        for i in range(n_total):
            dists = [sum((X_scaled[i][d] - centroids[k][d]) ** 2 for d in range(len(cluster_features))) for k in range(n_clusters)]
            cluster_assignments[i] = dists.index(min(dists))
        # Update
        for k in range(n_clusters):
            members = [X_scaled[i] for i in range(n_total) if cluster_assignments[i] == k]
            if members:
                centroids[k] = [sum(m[d] for m in members) / len(members) for d in range(len(cluster_features))]

    cluster_names = ["Prime Transactors", "High-Balance Revolvers", "Elevated Leverage", "Delinquency Watchlist"]
    cluster_descriptions = [
        "High liquidity, pristine payment history, low revolving utilization.",
        "Substantial credit lines and revolving balances with regular service payments.",
        "Moderate to high utilization with sporadic late payments and rising debt-to-income.",
        "Severe revolving distress, frequent late payment cycles, and elevated default risk."
    ]

    cluster_profiles = []
    for k in range(n_clusters):
        subset_indices = [i for i, c in enumerate(cluster_assignments) if c == k]
        c_count = len(subset_indices)
        c_pct = round((c_count / n_total) * 100.0, 1)
        defaults = sum(int(records[i]['default']) for i in subset_indices)
        c_def_rate = round((defaults / max(1, c_count)) * 100.0, 1)

        c_util_raw = sum(float(records[i]['utilization_rate']) for i in subset_indices) / max(1, c_count)
        c_util = round(c_util_raw * 100.0 if c_util_raw <= 1.0 else c_util_raw, 1)
        c_bal = round(sum(float(records[i]['cc_balance']) for i in subset_indices) / max(1, c_count), 2)
        c_inc = round(sum(float(records[i]['annual_income']) for i in subset_indices) / max(1, c_count), 2)
        c_late = round(sum(float(records[i]['late_payment_count_6m']) for i in subset_indices) / max(1, c_count), 2)

        tier = "High" if c_def_rate >= 40.0 or c_late >= 2.0 else ("Low" if c_late == 0 and c_util <= 25.0 else "Medium")
        name_idx = 3 if tier == "High" else (0 if tier == "Low" else (1 if c_bal > 8000 else 2))

        cluster_profiles.append({
            "cluster_id": k,
            "name": cluster_names[name_idx],
            "description": cluster_descriptions[name_idx],
            "riskTier": tier,
            "count": c_count,
            "portfolioPercentage": c_pct,
            "defaultRatePct": c_def_rate,
            "averageUtilizationPct": c_util,
            "averageBalance": c_bal,
            "averageIncome": c_inc,
            "averageLatePayments6M": c_late,
            "centroid": [round(float(v), 4) for v in centroids[k]]
        })

    return cluster_profiles, cluster_assignments

# ---------------------------------------------------------------------------
# Main Training & Artifact Compilation
# ---------------------------------------------------------------------------

def main():
    print("============================================================")
    print(" CreditGuard AI — Production Model Training & Evaluation ")
    print("============================================================")

    if not os.path.exists(DATA_PATH):
        print(f"Error: Dataset not found at {DATA_PATH}", file=sys.stderr)
        sys.exit(1)

    records = []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        records = list(reader)

    n_total = len(records)
    n_defaults = sum(1 for r in records if int(r['default']) == 1)
    default_rate = n_defaults / max(1, n_total)

    print(f"--> Loaded dataset: {DATA_PATH}")
    print(f"    Total accounts: {n_total}, Defaults: {n_defaults} ({default_rate:.1%})\n")

    # Feature extraction
    X_raw = [[float(r.get(f) or 0.0) for f in MODEL_FEATURES] for r in records]
    y = [int(r['default']) for r in records]

    # 1. 5-Fold Stratified Cross-Validation on all candidate models
    comparison_rows, all_oof_probs = cross_validate_candidate_models(X_raw, y, k_folds=5, seed=42)

    # Save validation comparison CSV with 100% genuine computed metrics
    with open(COMPARISON_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(comparison_rows[0].keys()))
        writer.writeheader()
        writer.writerows(comparison_rows)
    print(f"--> Saved genuine validation model comparison to {COMPARISON_CSV}")

    # 2. Select winning model and train final production estimator on full dataset
    primary_meta = comparison_rows[0]
    selected_name = primary_meta['model_name']
    print(f"\n--> Fitting final Production Primary model: {selected_name} on complete dataset...")

    # Global scaler fitted on the full dataset
    global_scaler = StandardFeatureScaler()
    global_scaler.fit(X_raw)
    X_scaled = global_scaler.transform(X_raw)

    if selected_name == 'Gradient Boosting Classifier':
        final_model = GradientBoostingModel(n_estimators=30, learning_rate=0.2, max_depth=2)
    elif selected_name == 'Random Forest Classifier':
        final_model = RandomForestModel(n_estimators=24, max_depth=3, seed=42)
    elif selected_name == 'Gaussian Naive Bayes':
        final_model = GaussianNaiveBayesModel()
    else:
        final_model = LogisticRegressionModel(lr=0.06, l2_lambda=0.01, epochs=150)

    final_model.fit(X_scaled, y)

    # 3. Save Out-of-Fold Predictions CSV
    primary_oof = all_oof_probs[selected_name]
    pred_rows = []
    for idx, r in enumerate(records):
        cid = r['customer_id']
        actual = int(r['default'])
        p_val = float(primary_oof[idx])
        risk_score = round(p_val * 100.0, 1)
        pred_class = 1 if p_val >= 0.50 else 0
        tier = "Low" if risk_score <= 34.0 else ("High" if risk_score >= 65.0 else "Medium")

        if actual == 1 and pred_class == 1:
            outcome = "True Positive"
        elif actual == 0 and pred_class == 0:
            outcome = "True Negative"
        elif actual == 0 and pred_class == 1:
            outcome = "False Positive"
        else:
            outcome = "False Negative"

        raw_util = float(r.get('utilization_rate') or 0.0)
        util_pct = round(raw_util * 100.0 if raw_util <= 1.0 else raw_util, 1)

        pred_rows.append({
            'customer_id': cid,
            'full_name': r.get('full_name') or f"Cardholder {cid}",
            'credit_limit': float(r.get('credit_limit') or 15000),
            'outstanding_balance': float(r.get('cc_balance') or 0),
            'utilization_pct': util_pct,
            'late_payments_6m': int(float(r.get('late_payment_count_6m') or 0)),
            'actual_default': actual,
            'predicted_probability_pct': round(p_val * 100.0, 2),
            'predicted_class': pred_class,
            'risk_score_100': risk_score,
            'risk_tier': tier,
            'prediction_outcome': outcome,
            'brier_residual': round((p_val - actual) ** 2, 4),
            'calibrated_confidence': round(float(abs(p_val - 0.5) * 2.0), 3)
        })

    with open(PREDICTIONS_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(pred_rows[0].keys()))
        writer.writeheader()
        writer.writerows(pred_rows)
    print(f"--> Saved out-of-fold test predictions to {PREDICTIONS_CSV}")

    # 4. Fit KMeans Segmentation
    kmeans_clusters, cluster_assignments = fit_kmeans_clustering(records, n_clusters=4, seed=42)
    customer_cluster_map = {records[i]['customer_id']: cluster_assignments[i] for i in range(n_total)}

    # 5. Extract Feature Weights / Importance for Explainability
    feature_importances = {}
    if hasattr(final_model, 'weights') and final_model.weights:
        feature_importances = {f: round(final_model.weights[j], 4) for j, f in enumerate(MODEL_FEATURES)}
    else:
        # Compute sensitivity gradients through estimator
        base_x = [0.0] * len(MODEL_FEATURES)
        base_p = final_model.predict_proba_vector(base_x)
        for j, f in enumerate(MODEL_FEATURES):
            pert_x = list(base_x)
            pert_x[j] += 1.0
            pert_p = final_model.predict_proba_vector(pert_x)
            feature_importances[f] = round(pert_p - base_p, 4)

    # 6. Serialized Estimator Architecture
    estimator_spec = {
        "model_type": primary_meta['model_type'],
        "algorithm": selected_name,
        "is_tree_ensemble": hasattr(final_model, 'trees'),
        "trees": getattr(final_model, 'trees', []),
        "F0": getattr(final_model, 'F0', None),
        "learning_rate": getattr(final_model, 'learning_rate', None),
        "weights": getattr(final_model, 'weights', []),
        "bias": getattr(final_model, 'bias', None)
    }

    # 7. Complete Model Artifact
    model_artifact = {
        "model_name": f"CreditGuard_{selected_name.replace(' ', '_')}_Pipeline",
        "version": "2.2.0",
        "algorithm": selected_name,
        "features": MODEL_FEATURES,
        "feature_importances": feature_importances,
        "scaling_means": {f: round(global_scaler.means[j], 4) for j, f in enumerate(MODEL_FEATURES)},
        "scaling_stds": {f: round(global_scaler.stds[j], 4) for j, f in enumerate(MODEL_FEATURES)},
        "estimator": estimator_spec,
        "kmeans_clusters": kmeans_clusters,
        "customer_oof_probabilities": {records[i]['customer_id']: round(float(primary_oof[i]), 4) for i in range(n_total)},
        "customer_cluster_assignments": customer_cluster_map,
        "metrics": {
            "roc_auc": primary_meta['roc_auc'],
            "roc_auc_std": primary_meta['roc_auc_std'],
            "gini_coefficient": primary_meta['gini_coefficient'],
            "ks_statistic_pct": primary_meta['ks_statistic_pct'],
            "brier_score": primary_meta['brier_score'],
            "accuracy": round(primary_meta['accuracy_pct'] / 100.0, 4),
            "precision": primary_meta['precision'],
            "recall": primary_meta['recall'],
            "f1_score": primary_meta['f1_score']
        },
        "model_comparison": comparison_rows,
        "dataset_info": {
            "total_records": n_total,
            "defaults": n_defaults,
            "default_rate": round(default_rate, 4),
            "data_path": DATA_PATH,
            "zero_leakage_cv": "Evaluated via 5-Fold Stratified Cross-Validation with fold-specific feature standardizers."
        },
        "trained_at": datetime.now().isoformat()
    }

    # Serialize artifacts
    with open(MODEL_PKL_PATH, "wb") as f:
        pickle.dump(model_artifact, f)
    with open(ROOT_MODEL_PKL, "wb") as f:
        pickle.dump(model_artifact, f)
    with open(CREDITGUARD_PKL, "wb") as f:
        pickle.dump(model_artifact, f)
    with open(MODEL_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(model_artifact, f, indent=2)

    print(f"\n--> Model successfully saved to:")
    print(f"    - {MODEL_PKL_PATH}")
    print(f"    - {MODEL_JSON_PATH}")
    print("============================================================")
    print(" Training & Zero-Leakage Cross-Validation Complete! ")
    print("============================================================")

if __name__ == "__main__":
    main()
