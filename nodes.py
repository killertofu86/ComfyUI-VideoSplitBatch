import cv2
import numpy as np
import torch
import math
from comfy.model_management import InterruptProcessingException

loop_indexes = {}  # Modul-Ebene

class VideoSplitBatch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "video_path": ("STRING", {"default": "~/"}),
                "frames_per_segment": ("INT", {"default": 121, "min": 1, "max": 9999}),
                "current_segment": ("INT", {"default": 0, "min": 0, "max": 9999}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("images", "segment_index", "total_segments")
    FUNCTION = "load_segment"
    CATEGORY = "video"

    def load_segment(self, video_path, frames_per_segment, current_segment, unique_id):
        try:
            cap = cv2.VideoCapture(video_path)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            total_segments = math.ceil(total_frames / frames_per_segment)

            current_segment = loop_indexes.get(unique_id, current_segment)
            start_frame = current_segment * frames_per_segment
            end_frame = min(start_frame + frames_per_segment, total_frames)

            if start_frame >= total_frames:
                raise InterruptProcessingException()

            cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
            loop_indexes[unique_id] = current_segment + 1

            frames = []
            for i in range(start_frame, end_frame):
                ret, frame = cap.read()
                if not ret:
                    break
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frame = frame.astype(np.float32) / 255.0
                frames.append(frame)

            images = torch.from_numpy(np.stack(frames))
        finally:
            cap.release()
        return (images, current_segment, total_segments)


NODE_CLASS_MAPPINGS = {"VideoSplitBatch": VideoSplitBatch}
NODE_DISPLAY_NAME_MAPPINGS = {"VideoSplitBatch": "Video Split Node"}