"""Shared constants matching apps/web/src/constants.ts"""

WINDOW_SIZE = 30
NUM_JOINTS = 13
FEATURES_PER_JOINT = 3
INPUT_DIM = NUM_JOINTS * FEATURES_PER_JOINT

GESTURE_CLASSES = [
    "neutral",
    "flap",
    "glide",
    "dive",
    "bank_left",
    "bank_right",
]

CLASS_TO_IDX = {c: i for i, c in enumerate(GESTURE_CLASSES)}
