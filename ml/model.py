import torch
import torch.nn as nn

from constants import INPUT_DIM, WINDOW_SIZE


class TemporalBlock(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, kernel: int = 3, dilation: int = 1):
        super().__init__()
        padding = (kernel - 1) * dilation // 2
        self.net = nn.Sequential(
            nn.Conv1d(in_ch, out_ch, kernel, padding=padding, dilation=dilation),
            nn.BatchNorm1d(out_ch),
            nn.GELU(),
            nn.Dropout(0.15),
        )
        self.downsample = nn.Conv1d(in_ch, out_ch, 1) if in_ch != out_ch else None

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.net(x)
        res = x if self.downsample is None else self.downsample(x)
        return out + res


class GestureTCN(nn.Module):
    """Temporal CNN for multi-head gesture regression + classification."""

    def __init__(
        self,
        input_dim: int = INPUT_DIM,
        window: int = WINDOW_SIZE,
        num_classes: int = 6,
        hidden: int = 64,
    ):
        super().__init__()
        self.window = window
        self.input_dim = input_dim

        self.stem = nn.Conv1d(input_dim, hidden, 1)
        self.tcn = nn.Sequential(
            TemporalBlock(hidden, hidden, dilation=1),
            TemporalBlock(hidden, hidden * 2, dilation=2),
            TemporalBlock(hidden * 2, hidden * 2, dilation=4),
        )
        self.pool = nn.AdaptiveAvgPool1d(1)

        feat = hidden * 2
        self.flap_head = nn.Sequential(
            nn.Linear(feat, 32),
            nn.GELU(),
            nn.Linear(32, 1),
            nn.Sigmoid(),
        )
        self.bank_head = nn.Sequential(
            nn.Linear(feat, 32),
            nn.GELU(),
            nn.Linear(32, 1),
            nn.Tanh(),
        )
        self.pitch_head = nn.Sequential(
            nn.Linear(feat, 32),
            nn.GELU(),
            nn.Linear(32, 1),
            nn.Tanh(),
        )
        self.class_head = nn.Linear(feat, num_classes)

    def forward(self, x: torch.Tensor):
        # x: (B, T, F) -> conv expects (B, F, T)
        x = x.transpose(1, 2)
        x = self.stem(x)
        x = self.tcn(x)
        x = self.pool(x).squeeze(-1)

        flap = self.flap_head(x)
        bank = self.bank_head(x)
        pitch = self.pitch_head(x)
        logits = self.class_head(x)
        return flap, bank, pitch, logits
