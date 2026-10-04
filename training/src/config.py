"""Shared paths. Override the dataset location with the PTBXL_DIR environment variable."""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DATA_DIR = os.environ.get(
    "PTBXL_DIR",
    os.path.join(
        ROOT, "data",
        "ptb-xl-a-large-publicly-available-electrocardiography-dataset-1.0.3",
    ),
)
CKPT_DIR = os.path.join(ROOT, "checkpoints")
DEPLOY_DIR = os.path.join(ROOT, "deploy")
