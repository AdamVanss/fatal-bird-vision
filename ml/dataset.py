import json
import random
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import Dataset

from constants import CLASS_TO_IDX, GESTURE_CLASSES, INPUT_DIM, WINDOW_SIZE


class GestureDataset(Dataset):
    def __init__(self, windows: np.ndarray, labels: np.ndarray, targets: dict):
        self.windows = torch.tensor(windows, dtype=torch.float32)
        self.labels = torch.tensor(labels, dtype=torch.long)
        self.flap = torch.tensor(targets["flap"], dtype=torch.float32)
        self.bank = torch.tensor(targets["bank"], dtype=torch.float32)
        self.pitch = torch.tensor(targets["pitch"], dtype=torch.float32)

    def __len__(self):
        return len(self.windows)

    def __getitem__(self, idx):
        return {
            "x": self.windows[idx],
            "label": self.labels[idx],
            "flap": self.flap[idx],
            "bank": self.bank[idx],
            "pitch": self.pitch[idx],
        }


def load_json_dataset(path: Path) -> list[dict]:
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    return data.get("samples", [])


def windows_from_sample(frames: list[list[float]], window_size: int = WINDOW_SIZE):
    arr = np.array(frames, dtype=np.float32)
    if len(arr) < window_size:
        pad = np.repeat(arr[:1], window_size - len(arr), axis=0)
        arr = np.vstack([pad, arr])
    windows = []
    step = max(1, window_size // 3)
    for start in range(0, len(arr) - window_size + 1, step):
        windows.append(arr[start : start + window_size])
    return windows


def build_from_recorded(samples: list[dict]):
    X, y, flap, bank, pitch = [], [], [], [], []
    for sample in samples:
        label = sample["label"]
        if label not in CLASS_TO_IDX:
            continue
        idx = CLASS_TO_IDX[label]
        for w in windows_from_sample(sample["frames"]):
            if w.shape != (WINDOW_SIZE, INPUT_DIM):
                w = w.reshape(WINDOW_SIZE, INPUT_DIM)
            X.append(w)
            y.append(idx)
            f, b, p = targets_for_class(label, w)
            flap.append(f)
            bank.append(b)
            pitch.append(p)
    return np.array(X), np.array(y), {
        "flap": np.array(flap),
        "bank": np.array(bank),
        "pitch": np.array(pitch),
    }


def targets_for_class(label: str, window: np.ndarray) -> tuple[float, float, float]:
    """Derive regression targets from gesture label + window geometry."""
    last = window[-1]
    l_wrist_y = last[4 * 3 + 1]
    r_wrist_y = last[5 * 3 + 1]
    wrist_y = (l_wrist_y + r_wrist_y) / 2
    bank_val = np.clip((l_wrist_y - r_wrist_y) * 2.5, -1, 1)

    if label == "flap":
        return 0.85, bank_val * 0.3, -0.2
    if label == "glide":
        return 0.1, bank_val * 0.2, 0.3
    if label == "dive":
        return 0.05, bank_val * 0.2, -0.85
    if label == "bank_left":
        return 0.15, -0.75, 0.0
    if label == "bank_right":
        return 0.15, 0.75, 0.0
    return 0.05, bank_val, np.clip(-wrist_y, -1, 1)


def synthesize_gesture_sequence(label: str, length: int = 90) -> np.ndarray:
    """Procedural landmark sequences for bootstrapping when no user data exists."""
    frames = []
    t = np.linspace(0, 4 * np.pi, length)

    for i, phase in enumerate(t):
        frame = np.zeros(INPUT_DIM, dtype=np.float32)
        # indices: 0 LS, 1 RS, 2 LE, 3 RE, 4 LW, 5 RW (in upper body array)
        # Actually our array is 13 joints * 3 = 39 dims
        # joint index in UPPER_BODY: 5=left wrist, 6=right wrist (0-indexed in 13 joints)

        lw_y, rw_y = -0.05, -0.05
        lw_x, rw_x = -0.55, 0.55

        if label == "flap":
            amp = 0.35
            lw_y = -0.1 + amp * np.sin(phase * 2)
            rw_y = -0.1 + amp * np.sin(phase * 2 + 0.2)
        elif label == "glide":
            lw_y = rw_y = -0.35
            lw_x, rw_x = -0.85, 0.85
        elif label == "dive":
            lw_y = rw_y = 0.35
            lw_x, rw_x = -0.35, 0.35
        elif label == "bank_left":
            lw_y, rw_y = -0.25, -0.05
            lw_x, rw_x = -0.75, 0.45
        elif label == "bank_right":
            lw_y, rw_y = -0.05, -0.25
            lw_x, rw_x = -0.45, 0.75
        else:
            lw_y = rw_y = -0.08 + 0.03 * np.sin(phase)

        noise = np.random.normal(0, 0.02, INPUT_DIM)
        frame[4 * 3] = lw_x + noise[4 * 3]
        frame[4 * 3 + 1] = lw_y + noise[4 * 3 + 1]
        frame[5 * 3] = rw_x + noise[5 * 3]
        frame[5 * 3 + 1] = rw_y + noise[5 * 3 + 1]
        frame[0 * 3 + 1] = -0.15  # left shoulder
        frame[1 * 3 + 1] = -0.15  # right shoulder
        frames.append(frame)

    return frames


def generate_synthetic_dataset(samples_per_class: int = 200):
    X, y, flap, bank, pitch = [], [], [], [], []
    for label in GESTURE_CLASSES:
        for _ in range(samples_per_class):
            seq = synthesize_gesture_sequence(label, length=90 + random.randint(0, 30))
            start = random.randint(0, max(0, len(seq) - WINDOW_SIZE))
            w = np.array(seq[start : start + WINDOW_SIZE])
            if w.shape[0] < WINDOW_SIZE:
                continue
            X.append(w)
            y.append(CLASS_TO_IDX[label])
            f, b, p = targets_for_class(label, w)
            flap.append(f)
            bank.append(b)
            pitch.append(p)
    return np.array(X), np.array(y), {
        "flap": np.array(flap),
        "bank": np.array(bank),
        "pitch": np.array(pitch),
    }
