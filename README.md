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
