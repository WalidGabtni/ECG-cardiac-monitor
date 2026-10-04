import numpy as np
import wfdb
import ast
import pandas as pd

import os
from config import DATA_DIR

BASE = DATA_DIR + os.sep
FRONTAL = [0, 1, 2, 3, 4, 5]

df = pd.read_csv(BASE + 'ptbxl_database.csv', index_col='ecg_id')
df.scp_codes = df.scp_codes.apply(ast.literal_eval)
scp = pd.read_csv(BASE + 'scp_statements.csv', index_col=0)

def get_class(codes):
    for key in codes:
        if key in scp.index:
            superclass = scp.loc[key, 'diagnostic_class']
            if pd.notna(superclass) and superclass in ['NORM', 'MI', 'STTC', 'CD', 'HYP']:
                return superclass
    return None

df['label'] = df.scp_codes.apply(get_class)
test_df = df[df.strat_fold == 10]

# Per-class sample indices selected with find_best_samples.py
BEST_IDX = {'NORM': 20, 'MI': 44, 'STTC': 24, 'CD': 3, 'HYP': 30}

print('#pragma once')
print('#include <stdint.h>')
print('#define ECG_SAMPLES 6000')

for cls in ['NORM', 'MI', 'STTC', 'CD', 'HYP']:
    subset = test_df[test_df.label == cls]
    row = subset.iloc[BEST_IDX[cls]]
    path = BASE + row.filename_lr
    record = wfdb.rdrecord(path)
    signal = record.p_signal[:1000, :]
    signal = signal[:, FRONTAL]
    mean = signal.mean()
    std = signal.std() + 1e-8
    signal = (signal - mean) / std
    signal = np.clip(signal, -1.0, 1.0)
    result = []
    for lead in range(6):
        result.extend((signal[:, lead] * 127).astype(np.int8).tolist())
    
    print(f'const int8_t ecg_{cls.lower()}[6000] = {{')
    for i in range(0, 6000, 100):
        chunk = result[i:i+100]
        ending = ',' if i + 100 < 6000 else ''
        print('  ' + ', '.join(map(str, chunk)) + ending)
    print('};')
