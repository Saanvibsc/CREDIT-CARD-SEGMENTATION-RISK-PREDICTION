import express from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = 3000;

app.use(express.json());

// Helper to execute Python engine commands via child_process
function runPythonCommand(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const pythonProc = spawn('python3', ['creditguard_engine.py', ...args], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let stdout = '';
    let stderr = '';

    pythonProc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    pythonProc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    pythonProc.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        return reject(new Error(stderr || `Python process exited with code ${code}`));
      }
      try {
        const json = JSON.parse(stdout.trim());
        resolve(json);
      } catch (err) {
        reject(new Error(`Failed to parse Python JSON output: ${stdout}\nStderr: ${stderr}`));
      }
    });

    pythonProc.on('error', (err) => {
      reject(err);
    });
  });
}

// 1. Health endpoint
app.get('/api/v1/health', async (req, res) => {
  try {
    const spec = await runPythonCommand(['--action', 'spec']);
    res.json({
      status: 'healthy',
      version: '1.6.0',
      runtime: 'Python 3.10 Engine',
      modelLoaded: true,
      modelSpec: spec
    });
  } catch (err: any) {
    res.json({
      status: 'degraded',
      error: err.message,
      runtime: 'Python 3.10'
    });
  }
});

// 2. Portfolio Summary
app.get('/api/v1/portfolio/summary', async (req, res) => {
  const lowBound = String(req.query.lowRiskUpperBound || '34');
  const highBound = String(req.query.highRiskLowerBound || '65');
  try {
    const data = await runPythonCommand([
      '--action', 'portfolio',
      '--lowBound', lowBound,
      '--highBound', highBound
    ]);
    res.json(data);
  } catch (err: any) {
    console.error('[Python Error] portfolio/summary:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Search customers
app.get('/api/v1/customers', async (req, res) => {
  const q = String(req.query.q || '');
  const tier = String(req.query.tier || 'All');
  const card = String(req.query.cardType || 'All');
  const lowBound = String(req.query.lowRiskUpperBound || '34');
  const highBound = String(req.query.highRiskLowerBound || '65');

  try {
    const args = ['--action', 'customers', '--lowBound', lowBound, '--highBound', highBound];
    if (q) args.push('--query', q);
    if (tier) args.push('--tier', tier);
    if (card) args.push('--card', card);

    const customers = await runPythonCommand(args);
    res.json(customers);
  } catch (err: any) {
    console.error('[Python Error] customers:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Get customer by ID
app.get('/api/v1/customers/:id', async (req, res) => {
  try {
    const customer = await runPythonCommand(['--action', 'customer', '--id', req.params.id]);
    res.json(customer);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// 5. Predict Risk
app.post('/api/v1/risk/predict', async (req, res) => {
  const body = req.body || {};
  const customerId = body.customerId || 'CUST000001';
  const overrides = body.overrides || {};
  const config = body.config || {};
  const lowBound = String(config.lowRiskUpperBound || '34');
  const highBound = String(config.highRiskLowerBound || '65');

  try {
    const args = [
      '--action', 'predict',
      '--id', customerId,
      '--lowBound', lowBound,
      '--highBound', highBound
    ];
    if (overrides.utilization !== undefined) {
      args.push('--utilization', String(overrides.utilization));
    }
    if (overrides.delayedPayments !== undefined) {
      args.push('--delayedPayments', String(overrides.delayedPayments));
    }
    if (overrides.annualIncome !== undefined) {
      args.push('--annualIncome', String(overrides.annualIncome));
    }

    const startTime = performance.now();
    const assessment = await runPythonCommand(args);
    const latencyMs = Math.round(performance.now() - startTime);

    res.json({
      assessment,
      source: 'live-python-backend',
      latencyMs,
      modelMeta: {
        engine: 'Python 3.10 (creditguard_engine.py)',
        version: '1.6.0',
        algorithm: 'GradientBoostingClassifier + Platt Calibration',
        calibrated: true
      }
    });
  } catch (err: any) {
    console.error('[Python Error] predict:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. Early-warning alerts
app.get('/api/v1/alerts', async (req, res) => {
  try {
    const alerts = await runPythonCommand(['--action', 'alerts']);
    let filtered = alerts;
    const sev = req.query.severity;
    const stat = req.query.status;
    if (sev && sev !== 'All') {
      filtered = filtered.filter((a: any) => a.severity === sev);
    }
    if (stat && stat !== 'All') {
      filtered = filtered.filter((a: any) => a.status === stat);
    }
    res.json(filtered);
  } catch (err: any) {
    console.error('[Python Error] alerts:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Execute custom Python training / script runner
app.post('/api/v1/python/train', async (req, res) => {
  const pythonProc = spawn('python3', ['train_model.py'], {
    cwd: process.cwd(),
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  let stdout = '';
  let stderr = '';
  pythonProc.stdout.on('data', (d) => stdout += d.toString());
  pythonProc.stderr.on('data', (d) => stderr += d.toString());

  pythonProc.on('close', (code) => {
    res.json({
      success: code === 0,
      exitCode: code,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    });
  });
});

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CreditGuard AI] Server running at http://0.0.0.0:${PORT} with Python 3.10 Engine`);
  });
}

startServer();
