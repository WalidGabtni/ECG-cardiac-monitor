import os
import torch
import numpy as np
import wfdb
import ast
import pandas as pd
from model import CNN1D
from config import DATA_DIR, CKPT_DIR

BASE = DATA_DIR
FRONTAL = [0, 1, 2, 3, 4, 5]
CLASS_NAMES = ['NORM', 'MI', 'STTC', 'CD', 'HYP']
THRESHOLDS = [0.496, 0.342, 0.254, 0.270, 0.197]

df = pd.read_csv(BASE + '/ptbxl_database.csv', index_col='ecg_id')
df.scp_codes = df.scp_codes.apply(ast.literal_eval)
scp = pd.read_csv(BASE + '/scp_statements.csv', index_col=0)

def get_class(codes):
    for key in codes:
        if key in scp.index:
            superclass = scp.loc[key, 'diagnostic_class']
            if pd.notna(superclass) and superclass in CLASS_NAMES:
                return superclass
    return None

df['label'] = df.scp_codes.apply(get_class)
test_df = df[df.strat_fold == 10]

model = CNN1D(in_channels=6)
model.load_state_dict(torch.load(os.path.join(CKPT_DIR, 'cnn1d_lead6_best.pth'), map_location='cpu'))
model.eval()

for cls in CLASS_NAMES:
    subset = test_df[test_df.label == cls]
    row = subset.iloc[0]
    path = BASE + '/' + row.filename_lr
    record = wfdb.rdrecord(path)
    signal = record.p_signal[:1000, :]
    signal = signal[:, FRONTAL]
    
    mean = signal.mean()
    std = signal.std() + 1e-8
    signal = (signal - mean) / std
    
    x = torch.tensor(signal.T, dtype=torch.float32).unsqueeze(0)  # (1, 6, 1000)
    
    with torch.no_grad():
        logits = model(x).numpy()[0]
    
    probs = 1 / (1 + np.exp(-logits))
    pred = CLASS_NAMES[np.argmax(probs)]
    
    print(f'\nExpected: {cls}')
    for i, c in enumerate(CLASS_NAMES):
        detected = probs[i] >= THRESHOLDS[i]
        print(f'  {c}: {probs[i]:.4f} {"DETECTED" if detected else ""}')
    print(f'  → Prediction: {pred}')