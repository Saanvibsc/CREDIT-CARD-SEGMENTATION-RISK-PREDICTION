# CreditGuard AI — Flask Prototype

## Files
- `app.py`: Flask backend, customer lookup, model prediction, portfolio metrics, PDF report.
- `templates/index.html`: HTML interface.
- `static/style.css`: CSS styling.
- `requirements.txt`: Python dependencies.
- Add your own `creditguard_model.pkl` and `combined_credit_risk_realistic_with_ids.csv` beside `app.py`.

## Run locally
1. Install Python 3.10–3.12 if possible, in an isolated virtual environment.
2. Install packages:
   ```bash
   pip install -r requirements.txt
   ```
3. Place `creditguard_model.pkl` and `combined_credit_risk_realistic_with_ids.csv` in this folder.
4. Run:
   ```bash
   python app.py
   ```
5. Open `http://127.0.0.1:5000`.

If files are elsewhere, set `MODEL_PATH` and `DATA_PATH` environment variables.

## Important notes
- The model expects the same 70 input features used during training. The app checks that all feature columns exist.
- The app assumes class label `1` means default; confirm the target encoding in your notebook.
- Risk bands are illustrative only. The risk score is predicted probability × 100, not an official CIBIL/FICO score.
- K-Means segmentation is not included yet; save its fitted clustering model and preprocessing pipeline separately before adding that feature.
- The app is a local educational prototype, not a production banking system.
