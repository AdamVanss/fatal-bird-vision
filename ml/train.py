"""Train the temporal gesture model."""

import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from constants import GESTURE_CLASSES, WINDOW_SIZE, INPUT_DIM
from dataset import (
    GestureDataset,
    build_from_recorded,
    generate_synthetic_dataset,
    load_json_dataset,
)
from model import GestureTCN


def train_epoch(model, loader, optim, device):
    model.train()
    ce = nn.CrossEntropyLoss()
    mse = nn.MSELoss()
    total = 0.0
    for batch in loader:
        x = batch["x"].to(device)
        label = batch["label"].to(device)
        flap_t = batch["flap"].unsqueeze(1).to(device)
        bank_t = batch["bank"].unsqueeze(1).to(device)
        pitch_t = batch["pitch"].unsqueeze(1).to(device)

        optim.zero_grad()
        flap, bank, pitch, logits = model(x)
        loss = (
            ce(logits, label)
            + 2.0 * mse(flap, flap_t)
            + 1.5 * mse(bank, bank_t)
            + 1.5 * mse(pitch, pitch_t)
        )
        loss.backward()
        optim.step()
        total += loss.item() * len(x)
    return total / len(loader.dataset)


@torch.no_grad()
def eval_epoch(model, loader, device):
    model.eval()
    preds, labels = [], []
    for batch in loader:
        x = batch["x"].to(device)
        label = batch["label"]
        _, _, _, logits = model(x)
        preds.extend(logits.argmax(1).cpu().numpy())
        labels.extend(label.numpy())
    labels = np.array(labels)
    preds = np.array(preds)
    acc = (preds == labels).mean()
    print("Per-class accuracy:")
    for i, name in enumerate(GESTURE_CLASSES):
        mask = labels == i
        if mask.sum() == 0:
            continue
        class_acc = (preds[mask] == i).mean()
        print(f"  {name}: {class_acc:.3f} ({mask.sum()} samples)")
    return acc


def stratified_split(X, y, targets, test_size=0.15, seed=42):
    rng = np.random.default_rng(seed)
    train_idx, val_idx = [], []
    for class_id in np.unique(y):
        idx = np.where(y == class_id)[0]
        rng.shuffle(idx)
        n_val = max(1, int(len(idx) * test_size))
        val_idx.extend(idx[:n_val].tolist())
        train_idx.extend(idx[n_val:].tolist())
    train_idx = np.array(train_idx)
    val_idx = np.array(val_idx)
    return (
        X[train_idx], X[val_idx], y[train_idx], y[val_idx],
        {k: targets[k][train_idx] for k in targets},
        {k: targets[k][val_idx] for k in targets},
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=str, default="", help="Optional recorded JSON dataset")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--out", type=str, default="../models/gesture_model.pt")
    args = parser.parse_args()

    if args.data and Path(args.data).exists():
        samples = load_json_dataset(Path(args.data))
        X, y, targets = build_from_recorded(samples)
        print(f"Loaded {len(X)} windows from {args.data}")
        if len(X) < 50:
            print("Too few recorded samples; mixing synthetic data")
            Xs, ys, ts = generate_synthetic_dataset(120)
            X = np.concatenate([X, Xs])
            y = np.concatenate([y, ys])
            targets = {
                k: np.concatenate([targets[k], ts[k]]) for k in targets
            }
    else:
        print("No dataset provided — training on synthetic gesture sequences")
        X, y, targets = generate_synthetic_dataset(220)

    X_train, X_val, y_train, y_val, targets_train, targets_val = stratified_split(
        X, y, targets, test_size=0.15
    )

    train_ds = GestureDataset(
        X_train, y_train, targets_train,
    )
    val_ds = GestureDataset(
        X_val, y_val, targets_val,
    )

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = GestureTCN().to(device)
    optim = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optim, T_max=args.epochs)

    best_acc = 0.0
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    for epoch in range(1, args.epochs + 1):
        loss = train_epoch(model, train_loader, optim, device)
        scheduler.step()
        acc = eval_epoch(model, val_loader, device)
        print(f"Epoch {epoch}/{args.epochs} loss={loss:.4f} val_acc={acc:.3f}")
        if acc >= best_acc:
            best_acc = acc
            torch.save(
                {
                    "model_state": model.state_dict(),
                    "config": {
                        "window_size": WINDOW_SIZE,
                        "input_dim": INPUT_DIM,
                        "classes": GESTURE_CLASSES,
                    },
                },
                out_path,
            )

    meta = {
        "classes": GESTURE_CLASSES,
        "window_size": WINDOW_SIZE,
        "input_dim": INPUT_DIM,
        "best_val_accuracy": best_acc,
        "training_source": "recorded" if args.data and Path(args.data).exists() else "synthetic",
    }
    meta_path = out_path.with_suffix(".meta.json")
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"Saved checkpoint to {out_path}")
    print(f"Saved metadata to {meta_path}")


if __name__ == "__main__":
    main()
