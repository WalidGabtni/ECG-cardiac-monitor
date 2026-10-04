"""
model.py — Three ECG classification architectures for PTB-XL (5-class multi-label)

Models
------
CNN1D              — 1D-CNN with QAT stubs  (168K params)
CNNGRU             — CNN + unidirectional GRU (242K params)
CNNBiGRUAttention  — CNN + BiGRU + additive attention (202K params)

All models accept in_channels ∈ {1, 6, 12}.
"""

import torch
import torch.nn as nn
from torch.ao.quantization import QuantStub, DeQuantStub


# ════════════════════════════════════════════════════════════════════════════
# 1. 1D-CNN  (QAT-ready, named layers)
# ════════════════════════════════════════════════════════════════════════════

class CNN1D(nn.Module):
    """
    Four conv blocks: 32→64→128→256 filters, kernels 7/5/3/3
    GlobalAveragePool → FC(fc_size) → FC(5)

    fc_size defaults to 256 for Lead I and 6-lead models.
    Use fc_size=128 for the legacy 12-lead checkpoint.
    """

    def __init__(self, in_channels: int = 1, num_classes: int = 5, fc_size: int = 256):
        super().__init__()
        self.quant   = QuantStub()
        self.dequant = DeQuantStub()

        # ── Conv blocks ────────────────────────────────────────────────────
        self.conv1  = nn.Conv1d(in_channels, 32, kernel_size=7, padding=3, bias=False)
        self.bn1    = nn.BatchNorm1d(32)
        self.relu1  = nn.ReLU(inplace=True)
        self.pool1  = nn.MaxPool1d(2)

        self.conv2  = nn.Conv1d(32, 64, kernel_size=5, padding=2, bias=False)
        self.bn2    = nn.BatchNorm1d(64)
        self.relu2  = nn.ReLU(inplace=True)
        self.pool2  = nn.MaxPool1d(2)

        self.conv3  = nn.Conv1d(64, 128, kernel_size=3, padding=1, bias=False)
        self.bn3    = nn.BatchNorm1d(128)
        self.relu3  = nn.ReLU(inplace=True)
        self.pool3  = nn.MaxPool1d(2)

        self.conv4  = nn.Conv1d(128, 256, kernel_size=3, padding=1, bias=False)
        self.bn4    = nn.BatchNorm1d(256)
        self.relu4  = nn.ReLU(inplace=True)

        # global average pool
        self.gap = nn.AdaptiveAvgPool1d(1)

        # ── Classifier ────────────────────────────────────────────────────
        self.fc1      = nn.Linear(256, fc_size)
        self.relu_fc  = nn.ReLU(inplace=True)
        self.dropout  = nn.Dropout(0.3)
        self.fc2      = nn.Linear(fc_size, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.quant(x)

        x = self.pool1(self.relu1(self.bn1(self.conv1(x))))
        x = self.pool2(self.relu2(self.bn2(self.conv2(x))))
        x = self.pool3(self.relu3(self.bn3(self.conv3(x))))
        x = self.relu4(self.bn4(self.conv4(x)))

        x = self.gap(x).view(-1, 256)   # (B, 256)

        x = self.dropout(self.relu_fc(self.fc1(x)))
        x = self.fc2(x)

        x = self.dequant(x)
        return x


# ── Legacy key remap (cnn1d_best.pth only) ──────────────────────────────────

OLD_KEY_MAP = {
    "features.0":  "conv1",
    "features.1":  "bn1",
    "features.4":  "conv2",
    "features.5":  "bn2",
    "features.8":  "conv3",
    "features.9":  "bn3",
    "features.12": "conv4",
    "features.13": "bn4",
    "classifier.1": "fc1",
    "classifier.4": "fc2",
}


def remap_cnn1d_checkpoint(state_dict: dict) -> dict:
    """Rename keys from old sequential format to named format."""
    new_sd = {}
    for k, v in state_dict.items():
        new_k = k
        for old_prefix, new_prefix in OLD_KEY_MAP.items():
            if k.startswith(old_prefix + ".") or k == old_prefix:
                new_k = k.replace(old_prefix, new_prefix, 1)
                break
        new_sd[new_k] = v
    return new_sd


# ════════════════════════════════════════════════════════════════════════════
# 2. CNN + GRU
# ════════════════════════════════════════════════════════════════════════════

class CNNGRU(nn.Module):
    """3 conv blocks → 2-layer unidirectional GRU → last hidden → FC(64) → FC(5)"""

    def __init__(self, in_channels: int = 1, num_classes: int = 5):
        super().__init__()

        self.conv_blocks = nn.Sequential(
            nn.Conv1d(in_channels, 32, kernel_size=7, padding=3, bias=False),
            nn.BatchNorm1d(32), nn.ReLU(inplace=True), nn.MaxPool1d(2),
            nn.Conv1d(32, 64, kernel_size=5, padding=2, bias=False),
            nn.BatchNorm1d(64), nn.ReLU(inplace=True), nn.MaxPool1d(2),
            nn.Conv1d(64, 128, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm1d(128), nn.ReLU(inplace=True), nn.MaxPool1d(2),
        )

        self.gru = nn.GRU(
            input_size=128,
            hidden_size=128,
            num_layers=2,
            batch_first=True,
            dropout=0.3,
        )

        self.classifier = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(64, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.conv_blocks(x)
        x = x.permute(0, 2, 1)
        _, h = self.gru(x)
        x = h[-1]
        return self.classifier(x)


# ════════════════════════════════════════════════════════════════════════════
# 3. CNN + BiGRU + Additive Attention
# ════════════════════════════════════════════════════════════════════════════

class AdditiveAttention(nn.Module):
    def __init__(self, hidden_size: int):
        super().__init__()
        self.W = nn.Linear(hidden_size, hidden_size, bias=False)
        self.v = nn.Linear(hidden_size, 1, bias=False)

    def forward(self, h: torch.Tensor) -> torch.Tensor:
        scores  = self.v(torch.tanh(self.W(h)))
        weights = torch.softmax(scores, dim=1)
        context = (weights * h).sum(dim=1)
        return context


class CNNBiGRUAttention(nn.Module):
    def __init__(self, in_channels: int = 1, num_classes: int = 5):
        super().__init__()

        self.conv_blocks = nn.Sequential(
            nn.Conv1d(in_channels, 32, kernel_size=7, padding=3, bias=False),
            nn.BatchNorm1d(32), nn.ReLU(inplace=True), nn.MaxPool1d(2),
            nn.Conv1d(32, 64, kernel_size=5, padding=2, bias=False),
            nn.BatchNorm1d(64), nn.ReLU(inplace=True), nn.MaxPool1d(2),
            nn.Conv1d(64, 128, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm1d(128), nn.ReLU(inplace=True), nn.MaxPool1d(2),
        )

        self.bigru = nn.GRU(
            input_size=128,
            hidden_size=64,
            num_layers=2,
            batch_first=True,
            bidirectional=True,
            dropout=0.3,
        )

        self.attention = AdditiveAttention(hidden_size=128)

        self.classifier = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(64, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.conv_blocks(x)
        x = x.permute(0, 2, 1)
        h, _ = self.bigru(x)
        context = self.attention(h)
        return self.classifier(context)


# ════════════════════════════════════════════════════════════════════════════
# Factory helpers
# ════════════════════════════════════════════════════════════════════════════

MODEL_REGISTRY = {
    "cnn1d":            CNN1D,
    "cnn_gru":          CNNGRU,
    "cnn_bigru_attn":   CNNBiGRUAttention,
}


def build_model(name: str, in_channels: int = 1, num_classes: int = 5) -> nn.Module:
    if name not in MODEL_REGISTRY:
        raise ValueError(f"Unknown model '{name}'. Choose from {list(MODEL_REGISTRY)}")
    return MODEL_REGISTRY[name](in_channels=in_channels, num_classes=num_classes)


if __name__ == "__main__":
    for name, Model in MODEL_REGISTRY.items():
        for c in (1, 6, 12):
            m = Model(in_channels=c)
            x = torch.randn(2, c, 1000)
            out = m(x)
            n_params = sum(p.numel() for p in m.parameters())
            print(f"{name:22s}  in_channels={c}  out={tuple(out.shape)}  params={n_params:,}")