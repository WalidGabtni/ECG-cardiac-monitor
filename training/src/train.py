"""
train.py — Training script for PTB-XL ECG classification

Usage
-----
python src/train.py --model cnn1d          --lead 2 --epochs 30
python src/train.py --model cnn_gru        --lead 2 --epochs 50
python src/train.py --model cnn_bigru_attn --lead 2 --epochs 50

Lead:  0=Lead I   1=Lead II   2=Lead III   6=6-lead frontal   12=all-12
"""

import argparse
import os
import random
import numpy as np
import torch
import torch.nn as nn
from torch.optim import Adam
from torch.optim.lr_scheduler import ReduceLROnPlateau
from sklearn.metrics import f1_score

from dataset import get_dataloaders, SUPERCLASSES
from model import CNN1D, build_model

from config import DATA_DIR, CKPT_DIR


def set_seed(seed: int = 42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True


def lead_tag(lead_index) -> str:
    if lead_index is None:
        return "12lead"
    return {0: "lead1", 1: "lead2", 2: "lead3", 6: "lead6"}[lead_index]


def ckpt_name_for(model_name: str, lead_index, seed: int = 42) -> str:
    """
    seed=42 keeps the base filenames so the default checkpoints are not overwritten.
    Any other seed gets a "_sNN" suffix so multi-seed runs land side by side.
    """
    tag = lead_tag(lead_index)
    seed_suffix = "" if seed == 42 else f"_s{seed}"
    if lead_index == 0:
        return f"{model_name}{seed_suffix}_best.pth"
    return f"{model_name}_{tag}{seed_suffix}_best.pth"


def train_one_epoch(model, loader, criterion, optimizer, device):
    model.train()
    total_loss = 0.0
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        optimizer.zero_grad()
        loss = criterion(model(x), y)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * x.size(0)
    return total_loss / len(loader.dataset)


@torch.no_grad()
def eval_metrics(model, loader, criterion, device, threshold: float = 0.5):
    model.eval()
    total_loss = 0.0
    all_probs, all_labels = [], []

    for x, y in loader:
        x, y = x.to(device), y.to(device)
        logits = model(x)
        total_loss += criterion(logits, y).item() * x.size(0)
        probs = torch.sigmoid(logits).cpu().numpy()
        all_probs.append(probs)
        all_labels.append(y.cpu().numpy())

    probs  = np.vstack(all_probs)
    labels = np.vstack(all_labels)
    preds  = (probs >= threshold).astype(int)
    n      = len(loader.dataset)

    sens_list, spec_list = [], []
    for i in range(labels.shape[1]):
        tp = ((preds[:, i] == 1) & (labels[:, i] == 1)).sum()
        fn = ((preds[:, i] == 0) & (labels[:, i] == 1)).sum()
        tn = ((preds[:, i] == 0) & (labels[:, i] == 0)).sum()
        fp = ((preds[:, i] == 1) & (labels[:, i] == 0)).sum()
        sens_list.append(tp / (tp + fn + 1e-8))
        spec_list.append(tn / (tn + fp + 1e-8))

    val_loss = total_loss / n
    sens     = float(np.mean(sens_list))
    spec     = float(np.mean(spec_list))
    f1       = f1_score(labels, preds, average="macro", zero_division=0)
    return val_loss, sens, spec, f1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model",    default="cnn1d",
                        choices=["cnn1d", "cnn_gru", "cnn_bigru_attn"])
    parser.add_argument("--lead",     type=int, default=0,
                        help="0=LeadI  1=LeadII  2=LeadIII  6=6lead  12=all-12")
    parser.add_argument("--epochs",   type=int, default=30)
    parser.add_argument("--batch",    type=int, default=64)
    parser.add_argument("--lr",       type=float, default=1e-3)
    parser.add_argument("--workers",  type=int, default=4)
    parser.add_argument("--data_dir", default=DATA_DIR)
    parser.add_argument("--ckpt_dir", default=CKPT_DIR)
    parser.add_argument("--seed",     type=int, default=42)
    parser.add_argument("--fc_size",  type=int, default=256,
                        help="FC hidden size for CNN1D (default 256)")
    args = parser.parse_args()

    lead_index  = None if args.lead == 12 else args.lead
    from dataset import resolve_channels
    _, in_channels = resolve_channels(lead_index)
    tag = lead_tag(lead_index)

    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[train] device={device}  lead={tag}  in_channels={in_channels}  fc_size={args.fc_size}")

    # Data
    loaders = get_dataloaders(
        data_dir=args.data_dir,
        lead_index=lead_index,
        batch_size=args.batch,
        num_workers=args.workers,
    )
    train_ds = loaders["train"].dataset
    val_ds   = loaders["val"].dataset
    test_ds  = loaders["test"].dataset

    print(f"Loading ECG signals ({tag})...")
    total = len(train_ds) + len(val_ds) + len(test_ds)
    print(f"Signals loaded: ({total}, 1000)")
    print(f"Label shape: ({total}, {len(SUPERCLASSES)}), Classes: {SUPERCLASSES}")
    print(
        f"Train: ({len(train_ds)}, {in_channels}, 1000) | "
        f"Val: ({len(val_ds)}, {in_channels}, 1000) | "
        f"Test: ({len(test_ds)}, {in_channels}, 1000)"
    )
    print()

    # Model
    if args.model == "cnn1d":
        model = CNN1D(in_channels=in_channels, fc_size=args.fc_size).to(device)
    else:
        model = build_model(args.model, in_channels=in_channels).to(device)

    n_params = sum(p.numel() for p in model.parameters())
    print(f"Training {args.model} (fc_size={args.fc_size}) for {args.epochs} epochs  [{n_params:,} params]")
    print()

    criterion = nn.BCEWithLogitsLoss()
    optimizer = Adam(model.parameters(), lr=args.lr)
    scheduler = ReduceLROnPlateau(optimizer, patience=3, factor=0.5)

    os.makedirs(args.ckpt_dir, exist_ok=True)
    ckpt_path = os.path.join(args.ckpt_dir, ckpt_name_for(args.model, lead_index, args.seed))

    print(f"{'Epoch':>5}  {'Train Loss':>10}  {'Val Loss':>8}  {'Sens':>6}  {'Spec':>6}  {'F1':>6}")
    print("-" * 55)

    best_val_loss = float("inf")
    for epoch in range(1, args.epochs + 1):
        train_loss = train_one_epoch(model, loaders["train"], criterion, optimizer, device)
        val_loss, sens, spec, f1 = eval_metrics(model, loaders["val"], criterion, device)
        scheduler.step(val_loss)

        improved = val_loss < best_val_loss
        if improved:
            best_val_loss = val_loss
            torch.save(model.state_dict(), ckpt_path)

        print(
            f"{epoch:>5}  {train_loss:>10.4f}  {val_loss:>8.4f}  "
            f"{sens:>6.4f}  {spec:>6.4f}  {f1:>6.4f}"
        )
        if improved:
            print(f"  + saved best model -> {ckpt_path}")

    print()
    print(f"Training complete. Best val loss: {best_val_loss:.4f}")
    print(f"Best model saved to {ckpt_path}")


if __name__ == "__main__":
    main()