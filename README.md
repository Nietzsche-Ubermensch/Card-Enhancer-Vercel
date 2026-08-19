# Card Enhancer

AI-powered sports card image enhancement: batch upload, blemish/scratch/dust
detection and removal, color/contrast correction, sharpening, and optional
Real-ESRGAN super-resolution upscaling.

## Canonical repository

`Nietzsche-Ubermensch/Card-Enhancer-Vercel` is the single source of truth for
all Card Enhancer development. Open future PRs, issues, and feature work here
to avoid fragmentation across forks and alternate accounts.

## Components

| Component | Path | Tech |
|-----------|------|------|
| Frontend  | `sports-card-enhancer/app` | React 19 + Vite 7 + TypeScript |
| Backend   | `sports-card-enhancer/backend` | FastAPI + Uvicorn |
| DCPT research pipeline | `backend/dcpt_pipeline` | PyTorch GNN/TDA experiments |

## Deployment

The application is **platform-independent** — it deploys as a single Docker
container with no reliance on any specific hosting provider. See
[DEPLOYMENT.md](./DEPLOYMENT.md) for full instructions (Docker, Render,
Fly.io, split frontend/backend hosting, environment variables).

Quick start:

```bash
docker build -t card-enhancer .
docker run -p 8000:8000 card-enhancer
# open http://localhost:8000
```

## Local development

```bash
# Backend
cd sports-card-enhancer/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (another shell)
cd sports-card-enhancer/app
pnpm install
pnpm dev
```

---

# DCPT Training Pipeline

## Overview
The **Degradation Classification Pre-Training (DCPT)** pipeline is a high-performance framework designed for **valuation** and **defect classification** of collectible cards. It integrates a novel graph neural network architecture with **node-specific attention** and **topological data analysis (TDA)**.

## Key Features
- **Node-Specific Attention**: Employs unique projection matrices ($W_Q, W_K, W_V, W_O$) for each node in the graph, allowing for granular feature extraction.
- **TDA-Modulated Attention**: Attention coefficients are dynamically adjusted using a sigmoid function of topological descriptors ($T_j^*$), prioritizing structurally significant regions.
- **Multi-Task Learning**: Jointly optimizes for market value prediction (regression) and defect identification (classification).
- **TDA Optimization**: Includes caching and approximation modules to handle computationally intensive topological calculations efficiently.

## Project Structure
- `dcpt_pipeline/models/dcpt_model.py`: Core architecture implementation.
- `dcpt_pipeline/training/trainers.py`: Multi-task training logic and metrics tracking.
- `dcpt_pipeline/tda_optimization/tda_core.py`: Caching, approximation, and GPU acceleration placeholders.
- `dcpt_pipeline/utils/data_utils.py`: Data loading and synthetic data generation.
- `dcpt_pipeline/tests/test_pipeline.py`: Comprehensive test suite for scientific validation.
- `run_pipeline.py`: End-to-end execution script.

## Getting Started
1. **Install Dependencies**:
   ```bash
   pip install torch torchvision torchaudio loguru scikit-learn joblib opencv-python pandas numpy tqdm
   ```
2. **Run Tests**:
   ```bash
   export PYTHONPATH=$PYTHONPATH:.
   python3 dcpt_pipeline/tests/test_pipeline.py
   ```
3. **Execute Pipeline**:
   ```bash
   python3 run_pipeline.py
   ```

## Scientific Principles
The pipeline follows first principles by grounding its attention mechanism in the topological complexity of the input data. The inclusion of the **BPDA Gate** logic in tests ensures that the system can handle non-differentiable boundaries during adversarial training or complex defense scenarios by approximating gradients during the backward pass.
