"""
dataset.py — PTB-XL dataloader with full RAM preloading (fast training)

lead_index values:
    0    = Lead I      (1×1000)
    1    = Lead II     (1×1000)
    2    = Lead III    (1×1000)
    6    = 6-lead frontal plane: I,II,III,aVR,aVL,aVF  (6×1000)
    None = full 12-lead (12×1000)

PTB-XL lead order in records:
    0=I  1=II  2=III  3=aVR  4=aVL  5=aVF  6=V1  7=V2  8=V3  9=V4  10=V5  11=V6
"""

import os
import numpy as np
import pandas as pd
import wfdb
import ast
import torch
from torch.utils.data import Dataset, DataLoader

SUPERCLASSES = ["NORM", "MI", "STTC", "CD", "HYP"]
NUM_CLASSES  = len(SUPERCLASSES)

# Frontal plane indices inside the 12-lead array
FRONTAL_INDICES = [0, 1, 2, 3, 4, 5]   # I, II, III, aVR, aVL, aVF


def load_ptbxl_metadata(data_dir: str) -> pd.DataFrame:
    csv_path = os.path.join(data_dir, "ptbxl_database.csv")
    df = pd.read_csv(csv_path, index_col="ecg_id")
    df["scp_codes"] = df["scp_codes"].apply(ast.literal_eval)
    return df


def load_scp_statements(data_dir: str) -> pd.DataFrame:
    path = os.path.join(data_dir, "scp_statements.csv")
    scp  = pd.read_csv(path, index_col=0)
    return scp[scp["diagnostic"] == 1]


def aggregate_diagnostic(scp_codes: dict, scp_statements: pd.DataFrame) -> list:
    labels = set()
    for code in scp_codes:
        if code in scp_statements.index:
            sc = scp_statements.loc[code, "diagnostic_class"]
            if isinstance(sc, str) and sc in SUPERCLASSES:
                labels.add(sc)
    return list(labels)


def build_label_vector(superclasses: list) -> np.ndarray:
    vec = np.zeros(NUM_CLASSES, dtype=np.float32)
    for sc in superclasses:
        if sc in SUPERCLASSES:
            vec[SUPERCLASSES.index(sc)] = 1.0
    return vec


def resolve_channels(lead_index):
    """
    Returns (indices_to_keep, in_channels) given a lead_index value.
    lead_index:  0/1/2 = single lead,  6 = frontal 6,  None = all 12
    """
    if lead_index is None:
        return None, 12
    if lead_index == 6:
        return FRONTAL_INDICES, 6
    return [lead_index], 1


class PTBXLDataset(Dataset):
    """
    Loads ALL signals into RAM once at construction.
    Every __getitem__ is a tensor index — zero disk I/O during training.
    """

    def __init__(self, data_dir: str, folds: list, lead_index=0):
        self.lead_index = lead_index
        indices, in_channels = resolve_channels(lead_index)

        # ── Metadata ────────────────────────────────────────────────────────
        df        = load_ptbxl_metadata(data_dir)
        scp_stmts = load_scp_statements(data_dir)

        df = df[df["strat_fold"].isin(folds)].copy()
        df["superclasses"] = df["scp_codes"].apply(
            lambda x: aggregate_diagnostic(x, scp_stmts)
        )
        df["label_vec"] = df["superclasses"].apply(build_label_vector)
        df = df[df["superclasses"].map(len) > 0].reset_index()

        n = len(df)
        print(f"  Loading {n} records into RAM...", end="", flush=True)

        # ── Preload all 12 leads then slice ──────────────────────────────────
        signals = np.empty((n, 12, 1000), dtype=np.float32)
        for i, row in df.iterrows():
            rec_path = os.path.join(data_dir, row["filename_lr"])
            sig, _   = wfdb.rdsamp(rec_path)          # (1000, 12)
            sig      = sig.T.astype(np.float32)        # (12, 1000)
            mu  = sig.mean()
            std = sig.std() + 1e-8
            signals[i] = (sig - mu) / std

        # Select leads
        if indices is not None:
            signals = signals[:, indices, :]           # (N, C, 1000)

        print(f" done.  Shape: {signals.shape}")

        self.signals = torch.from_numpy(signals)
        self.labels  = torch.from_numpy(np.vstack(df["label_vec"].values))

    def __len__(self):
        return len(self.signals)

    def __getitem__(self, idx):
        return self.signals[idx], self.labels[idx]


def get_dataloaders(
    data_dir: str,
    lead_index=0,
    batch_size: int = 64,
    num_workers: int = 0,
) -> dict:
    """
    lead_index:  0=Lead I  1=Lead II  2=Lead III  6=6-lead frontal  None=12-lead
    """
    splits = {"train": list(range(1, 9)), "val": [9], "test": [10]}
    loaders = {}
    for split, folds in splits.items():
        ds = PTBXLDataset(data_dir=data_dir, folds=folds, lead_index=lead_index)
        loaders[split] = DataLoader(
            ds,
            batch_size=batch_size,
            shuffle=(split == "train"),
            num_workers=num_workers,
            pin_memory=False,
        )
    return loaders


if __name__ == "__main__":
    from config import DATA_DIR as DATA
    for name, li in [("Lead I",0),("Lead II",1),("Lead III",2),("6-lead",6),("12-lead",None)]:
        loaders = get_dataloaders(DATA, lead_index=li, batch_size=4, num_workers=0)
        x, y = next(iter(loaders["train"]))
        print(f"{name:10s}  x={tuple(x.shape)}  y={tuple(y.shape)}")
