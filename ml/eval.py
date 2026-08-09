"""Evaluate gesture model on validation split or dataset file."""

import argparse
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from constants import GESTURE_CLASSES
from dataset import (
    GestureDataset,
    build_from_recorded,
    generate_synthetic_dataset,
    load_json_dataset,
)
from model import GestureTCN
from train import stratified_split


@torch.no_grad()
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=str, default="../models/gesture_model.pt")
    parser.add_argument("--data", type=str, default="")
    args = parser.parse_args()

    if args.data and Path(args.data).exists():
        samples = load_json_dataset(Path(args.data))
        X, y, targets = build_from_recorded(samples)
    else:
        X, y, targets = generate_synthetic_dataset(100)

    _, X_val, _, y_val, _, targets_val = stratified_split(X, y, targets, test_size=0.2)

    ds = GestureDataset(X_val, y_val, targets_val)
    loader = DataLoader(ds, batch_size=64)

    ckpt = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    model = GestureTCN()
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    preds, labels = [], []
    for batch in loader:
        _, _, _, logits = model(batch["x"])
        preds.extend(logits.argmax(1).numpy())
        labels.extend(batch["label"].numpy())

    labels = np.array(labels)
    preds = np.array(preds)
    print(f"Overall accuracy: {(preds == labels).mean():.3f}")
    print("Confusion matrix (rows=true, cols=pred):")
    n = len(GESTURE_CLASSES)
    matrix = np.zeros((n, n), dtype=int)
    for t, p in zip(labels, preds):
        matrix[t, p] += 1
    print(matrix)


if __name__ == "__main__":
    main()
