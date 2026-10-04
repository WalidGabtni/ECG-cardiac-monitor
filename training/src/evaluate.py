"""
evaluate.py — Evaluation script for PTB-XL ECG models

Reports all 4 metrics lenses:
  1. Macro-AUC  (threshold-independent)
  2. F1 @ 0.5   (default operating point)
  3. F1 @ tuned thresholds  (tuned on val, applied to test)
  4. Specificity @ ≥85% sensitivity  (clinical screening)

Also prints per-class AUC.

Usage examples
--------------
# Lead I checkpoints (original)
python src/evaluate.py --model cnn1d          --lead 0 --ckpt checkpoints/cnn1d_best.pth
python src/evaluate.py --model cnn_gru        --lead 0 --ckpt checkpoints/cnn_gru_best.pth
python src/evaluate.py --model cnn_bigru_attn --lead 0 --ckpt checkpoints/cnn_bigru_attn_best.pth

# Lead III (new experiment)
python src/evaluate.py --model cnn1d          --lead 2 --ckpt checkpoints/cnn1d_lead3_best.pth
python src/evaluate.py --model cnn_gru        --lead 2 --ckpt checkpoints/cnn_gru_lead3_best.pth
python src/evaluate.py --model cnn_bigru_attn --lead 2 --ckpt checkpoints/cnn_bigru_attn_lead3_best.pth

# 12-lead
python src/evaluate.py --model cnn1d --lead 12 --ckpt checkpoints/cnn1d_12lead_best.pth
"""

import argparse
import os
import numpy as np
import torch
from sklearn.metrics import roc_auc_score, f1_score

from dataset import get_dataloaders, SUPERCLASSES
from model import build_model, remap_cnn1d_checkpoint

from config import DATA_DIR, CKPT_DIR


# ── Inference helpers ────────────────────────────────────────────────────────

@torch.no_grad()
def collect_probs(model, loader, device) -> tuple[np.ndarray, np.ndarray]:
    """Return (logits→sigmoid, labels) as numpy arrays."""
    model.eval()
    all_probs, all_labels = [], []
    for x, y in loader:
        x = x.to(device)
        probs = torch.sigmoid(model(x)).cpu().numpy()
        all_probs.append(probs)
        all_labels.append(y.numpy())
    return np.vstack(all_probs), np.vstack(all_labels)


# ── Metric helpers ───────────────────────────────────────────────────────────

def macro_auc(probs, labels) -> float:
    return roc_auc_score(labels, probs, average="macro")


def per_class_auc(probs, labels) -> list[float]:
    return [
        roc_auc_score(labels[:, i], probs[:, i])
        for i in range(labels.shape[1])
    ]


def f1_at_threshold(probs, labels, threshold: float = 0.5) -> float:
    preds = (probs >= threshold).astype(int)
    return f1_score(labels, preds, average="macro", zero_division=0)


def tune_thresholds(val_probs, val_labels, grid=np.arange(0.1, 0.9, 0.02)):
    """Per-class threshold sweep on validation set, maximises macro-F1."""
    best_thresholds = []
    for i in range(val_labels.shape[1]):
        best_t, best_f1 = 0.5, 0.0
        for t in grid:
            preds = (val_probs[:, i] >= t).astype(int)
            f = f1_score(val_labels[:, i], preds, zero_division=0)
            if f > best_f1:
                best_f1, best_t = f, t
        best_thresholds.append(best_t)
    return np.array(best_thresholds)


def f1_at_tuned(probs, labels, thresholds) -> float:
    preds = (probs >= thresholds[np.newaxis, :]).astype(int)
    return f1_score(labels, preds, average="macro", zero_division=0)


def sensitivity_at_fixed(probs, labels, target_sens: float = 0.85):
    """
    For each class, find the lowest threshold that achieves ≥target_sens recall,
    then report the macro-specificity at those thresholds.
    """
    specificities = []
    for i in range(labels.shape[1]):
        y_true = labels[:, i]
        if y_true.sum() == 0:
            continue
        best_spec = 0.0
        # search over possible thresholds from high to low
        thresholds = np.sort(np.unique(probs[:, i]))[::-1]
        for t in thresholds:
            preds = (probs[:, i] >= t).astype(int)
            tp = ((preds == 1) & (y_true == 1)).sum()
            fn = ((preds == 0) & (y_true == 1)).sum()
            tn = ((preds == 0) & (y_true == 0)).sum()
            fp = ((preds == 1) & (y_true == 0)).sum()
            sens = tp / (tp + fn + 1e-8)
            spec = tn / (tn + fp + 1e-8)
            if sens >= target_sens:
                best_spec = spec
                break
        specificities.append(best_spec)
    return float(np.mean(specificities))


def sensitivity_macro(probs, labels, thresholds) -> float:
    """Macro sensitivity (recall) at given per-class thresholds."""
    senses = []
    for i in range(labels.shape[1]):
        y_true = labels[:, i]
        if y_true.sum() == 0:
            continue
        preds = (probs[:, i] >= thresholds[i]).astype(int)
        tp = ((preds == 1) & (y_true == 1)).sum()
        fn = ((preds == 0) & (y_true == 1)).sum()
        senses.append(tp / (tp + fn + 1e-8))
    return float(np.mean(senses))


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model",    default="cnn1d",
                        choices=["cnn1d", "cnn_gru", "cnn_bigru_attn"])
    parser.add_argument("--lead",     type=int, default=0,
                        help="0=LeadI  1=LeadII  2=LeadIII  12=all-12")
    parser.add_argument("--ckpt",     required=True, help="Path to .pth checkpoint")
    parser.add_argument("--batch",    type=int, default=128)
    parser.add_argument("--workers",  type=int, default=4)
    parser.add_argument("--data_dir", default=DATA_DIR)
    parser.add_argument("--remap",    action="store_true",
                        help="Apply old→new key remap (cnn1d_best.pth only)")
    parser.add_argument("--fc_size",  type=int, default=256,
                        help="FC hidden size for CNN1D (256 default, 256 for all configs)")
    args = parser.parse_args()

    lead_index  = None if args.lead == 12 else args.lead
    from dataset import resolve_channels
    _, in_channels = resolve_channels(lead_index)
    lead_name   = {0: "Lead I", 1: "Lead II", 2: "Lead III", 6: "6-lead", None: "12-lead"}[lead_index]

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[eval] model={args.model}  lead={lead_name}  device={device}")

    # ── Load model ──────────────────────────────────────────────────────────
    if args.model == "cnn1d":
        from model import CNN1D
        model = CNN1D(in_channels=in_channels, fc_size=args.fc_size).to(device)
    else:
        model = build_model(args.model, in_channels=in_channels).to(device)
    state = torch.load(args.ckpt, map_location=device)

    if args.remap:
        state = remap_cnn1d_checkpoint(state)

    model.load_state_dict(state, strict=False)
    print(f"[eval] Loaded checkpoint: {args.ckpt}")

    # ── Data ────────────────────────────────────────────────────────────────
    loaders = get_dataloaders(
        data_dir=args.data_dir,
        lead_index=lead_index,
        batch_size=args.batch,
        num_workers=args.workers,
    )

    # ── Collect predictions ─────────────────────────────────────────────────
    print("[eval] Running inference on val set (threshold tuning)...")
    val_probs,  val_labels  = collect_probs(model, loaders["val"],  device)
    print("[eval] Running inference on test set...")
    test_probs, test_labels = collect_probs(model, loaders["test"], device)

    # ── Tune thresholds on val ───────────────────────────────────────────────
    tuned_thresholds = tune_thresholds(val_probs, val_labels)

    # ── Compute metrics ─────────────────────────────────────────────────────
    auc     = macro_auc(test_probs, test_labels)
    f1_05   = f1_at_threshold(test_probs, test_labels, 0.5)
    f1_tuned= f1_at_tuned(test_probs, test_labels, tuned_thresholds)
    sens    = sensitivity_macro(test_probs, test_labels, tuned_thresholds)
    spec85  = sensitivity_at_fixed(test_probs, test_labels, target_sens=0.85)
    pc_auc  = per_class_auc(test_probs, test_labels)

    # ── Print results ────────────────────────────────────────────────────────
    sep = "-" * 60
    print(f"\n{sep}")
    print(f"  Model   : {args.model}")
    print(f"  Lead    : {lead_name}")
    print(f"  Checkpoint: {os.path.basename(args.ckpt)}")
    print(sep)
    print(f"  Macro-AUC           : {auc:.4f}")
    print(f"  F1 @ 0.5            : {f1_05:.4f}")
    print(f"  F1 @ tuned thresh   : {f1_tuned:.4f}")
    print(f"  Sensitivity (tuned) : {sens:.4f}")
    print(f"  Specificity @85%Sen : {spec85:.4f}")
    print(sep)
    print(f"  Per-class AUC:")
    for cls, a in zip(SUPERCLASSES, pc_auc):
        print(f"    {cls:6s}: {a:.4f}")
    print(f"    {'Macro':6s}: {auc:.4f}")
    print(sep)

    # ── CSV-friendly single-line summary ─────────────────────────────────────
    pc_str = "  ".join(f"{a:.4f}" for a in pc_auc)
    print(
        f"\n[CSV]  {args.model},{lead_name},{auc:.4f},{f1_05:.4f},"
        f"{f1_tuned:.4f},{sens:.4f},{spec85:.4f},{pc_str}"
    )


if __name__ == "__main__":
    main()
