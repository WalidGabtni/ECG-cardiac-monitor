"""
run_multiseed.py — Multi-seed reliability check for the 1D-CNN across all four
lead configurations (Lead I, Lead III, 6-lead, 12-lead), reporting the spread
of macro-AUC over several seeds.

What it does
------------
For each lead config (Lead I, Lead III, 6-lead, 12-lead) and each seed:
  1. Trains cnn1d with that seed (skipped if the checkpoint already exists —
     seed 42 reuses an existing checkpoint instead of retraining).
  2. Evaluates the resulting checkpoint on the held-out test set.
  3. Appends one row (model, lead, seed, macro-AUC, F1@0.5, F1@tuned,
     sensitivity, specificity@85%sens, per-class AUCs) to
     results/multiseed_results.csv.

At the end it prints and writes results/multiseed_summary.csv: mean ± std of
macro-AUC per lead config across all seeds.

Usage
-----
    python src/run_multiseed.py
    python src/run_multiseed.py --seeds 42 43 44 45 46   # 5 seeds instead of 3
    python src/run_multiseed.py --force                  # retrain seed 42 too

Runs sequentially so you can watch progress / stop safely between runs
(Ctrl+C between runs is safe — already-finished rows stay in the CSV).
"""

import argparse
import csv
import os
import subprocess
import sys
from statistics import mean, pstdev

from train import CKPT_DIR, DATA_DIR, ckpt_name_for, lead_tag

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS_DIR = os.path.join(os.path.dirname(HERE), "results")
RESULTS_CSV = os.path.join(RESULTS_DIR, "multiseed_results.csv")
SUMMARY_CSV = os.path.join(RESULTS_DIR, "multiseed_summary.csv")

MODEL = "cnn1d"
EPOCHS = 30  # matches the --epochs used for cnn1d in train.py's own docstring
LEADS = [0, 2, 6, 12]  # Lead I, Lead III, 6-lead frontal, 12-lead
LEAD_NAMES = {0: "Lead I", 2: "Lead III", 6: "6-lead", 12: "12-lead"}

CSV_HEADER = [
    "model", "lead", "seed", "macro_auc", "f1_at_0.5", "f1_at_tuned",
    "sensitivity_tuned", "specificity_at_85sens",
    "auc_NORM", "auc_MI", "auc_STTC", "auc_CD", "auc_HYP",
]


def run(cmd):
    print(f"\n$ {' '.join(cmd)}")
    # Force UTF-8 for the child process's stdout: when stdout is piped
    # (as it is here) instead of attached to a real console, Windows
    # Python falls back to the system codepage (often cp1252), which
    # can't encode characters like the box-drawing "-" separators some
    # of these scripts print — that fallback is what caused the crash.
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", env=env)
    print(result.stdout[-3000:])  # tail, training logs can be long
    if result.returncode != 0:
        print(result.stderr[-3000:], file=sys.stderr)
        raise RuntimeError(f"Command failed (exit {result.returncode}): {' '.join(cmd)}")
    return result.stdout


def parse_csv_line(stdout: str) -> list:
    for line in stdout.splitlines():
        if line.startswith("[CSV]"):
            return [x.strip() for x in line[len("[CSV]"):].strip().split(",")]
    raise RuntimeError("No [CSV] line found in evaluate.py output")


def already_has_rows(model, lead_name, seed) -> bool:
    if not os.path.exists(RESULTS_CSV):
        return False
    with open(RESULTS_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["model"] == model and row["lead"] == lead_name and int(row["seed"]) == seed:
                return True
    return False


def append_row(row: list):
    os.makedirs(RESULTS_DIR, exist_ok=True)
    write_header = not os.path.exists(RESULTS_CSV)
    with open(RESULTS_CSV, "a", newline="") as f:
        w = csv.writer(f)
        if write_header:
            w.writerow(CSV_HEADER)
        w.writerow(row)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seeds", type=int, nargs="+", default=[42, 43, 44])
    parser.add_argument("--force", action="store_true",
                         help="Retrain even if a checkpoint / result row already exists")
    args = parser.parse_args()

    py = sys.executable
    train_py = os.path.join(HERE, "train.py")
    eval_py = os.path.join(HERE, "evaluate.py")

    for lead in LEADS:
        lead_name = LEAD_NAMES[lead]
        for seed in args.seeds:
            print(f"\n{'=' * 70}\n{MODEL}  |  {lead_name}  |  seed={seed}\n{'=' * 70}")

            if already_has_rows(MODEL, lead_name, seed) and not args.force:
                print("  already in multiseed_results.csv, skipping.")
                continue

            ckpt_name = ckpt_name_for(MODEL, None if lead == 12 else lead, seed)
            ckpt_path = os.path.join(CKPT_DIR, ckpt_name)

            if os.path.exists(ckpt_path) and not args.force:
                print(f"  checkpoint already exists ({ckpt_name}), skipping training.")
            else:
                run([
                    py, train_py,
                    "--model", MODEL,
                    "--lead", str(lead),
                    "--epochs", str(EPOCHS),
                    "--seed", str(seed),
                ])

            eval_stdout = run([
                py, eval_py,
                "--model", MODEL,
                "--lead", str(lead),
                "--ckpt", ckpt_path,
            ])

            fields = parse_csv_line(eval_stdout)
            # fields = [model, lead_name, auc, f1_05, f1_tuned, sens, spec85, pc0..pc4]
            row = [fields[0], fields[1], seed] + fields[2:]
            append_row(row)
            print(f"  -> logged: macro-AUC={fields[2]}")

    # ── Summary: mean ± std per lead config ─────────────────────────────────
    print(f"\n{'=' * 70}\nSUMMARY (mean +/- std macro-AUC across seeds)\n{'=' * 70}")
    by_lead = {name: [] for name in LEAD_NAMES.values()}
    with open(RESULTS_CSV, newline="") as f:
        for row in csv.DictReader(f):
            if row["model"] == MODEL:
                by_lead[row["lead"]].append(float(row["macro_auc"]))

    os.makedirs(RESULTS_DIR, exist_ok=True)
    with open(SUMMARY_CSV, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["model", "lead", "n_seeds", "mean_macro_auc", "std_macro_auc"])
        for lead_name, aucs in by_lead.items():
            if not aucs:
                continue
            mu = mean(aucs)
            sd = pstdev(aucs) if len(aucs) > 1 else 0.0
            w.writerow([MODEL, lead_name, len(aucs), f"{mu:.4f}", f"{sd:.4f}"])
            print(f"  {lead_name:10s}  n={len(aucs)}  {mu:.4f} +/- {sd:.4f}   (raw: {aucs})")

    print(f"\nWrote: {RESULTS_CSV}\nWrote: {SUMMARY_CSV}")


if __name__ == "__main__":
    main()
