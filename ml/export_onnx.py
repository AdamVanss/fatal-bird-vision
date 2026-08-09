"""Export trained PyTorch model to ONNX for browser inference."""

import argparse
from pathlib import Path

import torch

from constants import INPUT_DIM, WINDOW_SIZE
from model import GestureTCN


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=str, default="../models/gesture_model.pt")
    parser.add_argument("--out", type=str, default="../models/gesture_model.onnx")
    args = parser.parse_args()

    ckpt_path = Path(args.checkpoint)
    if not ckpt_path.exists():
        raise FileNotFoundError(f"Checkpoint not found: {ckpt_path}")

    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    model = GestureTCN()
    model.load_state_dict(ckpt["model_state"])
    model.eval()

    dummy = torch.randn(1, WINDOW_SIZE, INPUT_DIM)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        model,
        dummy,
        str(out_path),
        input_names=["landmarks"],
        output_names=["flap_energy", "bank", "pitch_intent", "gesture_logits"],
        dynamic_axes={
            "landmarks": {0: "batch"},
            "flap_energy": {0: "batch"},
            "bank": {0: "batch"},
            "pitch_intent": {0: "batch"},
            "gesture_logits": {0: "batch"},
        },
        opset_version=18,
        dynamo=False,
    )
    print(f"Exported ONNX model to {out_path}")


if __name__ == "__main__":
    main()
