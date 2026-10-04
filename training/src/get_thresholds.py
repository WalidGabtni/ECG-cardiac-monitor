import os
import torch
import numpy as np
from dataset import get_dataloaders
from model import CNN1D
from config import DATA_DIR, CKPT_DIR

BASE = DATA_DIR

model = CNN1D(in_channels=6)
model.load_state_dict(torch.load(os.path.join(CKPT_DIR, 'cnn1d_lead6_best.pth'), map_location='cpu'))
model.eval()

loaders = get_dataloaders(BASE, lead_index=6, batch_size=64, num_workers=0)

all_logits = []
all_labels = []
with torch.no_grad():
    for x, y in loaders['val']:
        out = model(x)
        all_logits.append(out.numpy())
        all_labels.append(y.numpy())

logits = np.vstack(all_logits)
labels = np.vstack(all_labels)
probs = 1 / (1 + np.exp(-logits))

CLASS_NAMES = ['NORM', 'MI', 'STTC', 'CD', 'HYP']
for i in range(5):
    best_t, best_f1 = 0.5, 0.0
    for t in np.linspace(0.1, 0.9, 100):
        preds = (probs[:, i] >= t).astype(float)
        tp = ((preds == 1) & (labels[:, i] == 1)).sum()
        fp = ((preds == 1) & (labels[:, i] == 0)).sum()
        fn = ((preds == 0) & (labels[:, i] == 1)).sum()
        f1 = 2*tp / (2*tp + fp + fn + 1e-8)
        if f1 > best_f1:
            best_f1, best_t = f1, t
    print(f'{CLASS_NAMES[i]}: threshold={best_t:.3f}  F1={best_f1:.4f}')