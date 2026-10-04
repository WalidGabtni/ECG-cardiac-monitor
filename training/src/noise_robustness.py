import os
import torch
import numpy as np
from sklearn.metrics import roc_auc_score, f1_score
from dataset import get_dataloaders
from model import CNN1D
from config import DATA_DIR, CKPT_DIR

BASE = DATA_DIR
CKPT = os.path.join(CKPT_DIR, 'cnn1d_lead6_best.pth')

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

model = CNN1D(in_channels=6, fc_size=256).to(device)
model.load_state_dict(torch.load(CKPT, map_location=device))
model.eval()

loaders = get_dataloaders(BASE, lead_index=6, batch_size=128, num_workers=0)

# Collect clean test data
all_x, all_y = [], []
for x, y in loaders['test']:
    all_x.append(x)
    all_y.append(y)
all_x = torch.cat(all_x)
all_y = torch.cat(all_y).numpy()

# Tune thresholds on val
val_probs_list, val_labels_list = [], []
with torch.no_grad():
    for x, y in loaders['val']:
        p = torch.sigmoid(model(x.to(device))).cpu().numpy()
        val_probs_list.append(p)
        val_labels_list.append(y.numpy())
val_probs = np.vstack(val_probs_list)
val_labels = np.vstack(val_labels_list)

thresholds = []
for i in range(5):
    best_t, best_f1 = 0.5, 0.0
    for t in np.linspace(0.1, 0.9, 100):
        preds = (val_probs[:, i] >= t).astype(int)
        f = f1_score(val_labels[:, i], preds, zero_division=0)
        if f > best_f1:
            best_f1, best_t = f, t
    thresholds.append(best_t)
thresholds = np.array(thresholds)

def evaluate(x_noisy, labels):
    with torch.no_grad():
        probs = torch.sigmoid(model(x_noisy.to(device))).cpu().numpy()
    auc = roc_auc_score(labels, probs, average='macro')
    preds = (probs >= thresholds[np.newaxis, :]).astype(int)
    f1 = f1_score(labels, preds, average='macro', zero_division=0)
    return auc, f1

def add_white_noise(x, snr_db):
    signal_power = x.pow(2).mean()
    noise_power = signal_power / (10 ** (snr_db / 10))
    noise = torch.randn_like(x) * torch.sqrt(noise_power)
    return x + noise

def add_baseline_wander(x, freq=0.5, fs=100):
    t = torch.linspace(0, x.shape[-1]/fs, x.shape[-1])
    wander = torch.sin(2 * np.pi * freq * t).unsqueeze(0).unsqueeze(0)
    amplitude = x.std(dim=-1, keepdim=True) * 0.5
    return x + wander * amplitude

print("SNR (dB) | Noise Type      | AUC    | F1 tuned")
print("-" * 52)

# Clean baseline
auc, f1 = evaluate(all_x, all_y)
print(f"Clean    | None            | {auc:.4f} | {f1:.4f}")

# White noise at different SNR levels
for snr in [20, 10, 5]:
    x_noisy = add_white_noise(all_x, snr)
    auc, f1 = evaluate(x_noisy, all_y)
    print(f"{snr:8d} | White noise     | {auc:.4f} | {f1:.4f}")

# Baseline wander
x_noisy = add_baseline_wander(all_x)
auc, f1 = evaluate(x_noisy, all_y)
print(f"    --   | Baseline wander | {auc:.4f} | {f1:.4f}")