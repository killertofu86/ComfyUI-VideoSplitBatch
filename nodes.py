import cv2
import numpy as np
import torch
import math
import os
from aiohttp import web
from server import PromptServer
from comfy.model_management import InterruptProcessingException

VIDEO_EXTS = {".mp4", ".webm", ".mkv", ".avi", ".mov"}
loop_indexes = {}  # {unique_id: next_segment} — server-side auto-increment


@PromptServer.instance.routes.get("/videosplitbatch/reset")
async def reset_loop(request):
    node_id = request.query.get("id", "")
    value = int(request.query.get("value", "0"))
    loop_indexes[node_id] = value
    return web.json_response({"ok": True, "segment": value})


@PromptServer.instance.routes.get("/videosplitbatch/browse")
async def browse(request):
    path = request.query.get("path", "~/")
    path = os.path.expanduser(path)

    if os.path.isdir(path):
        directory, prefix = path, ""
    else:
        directory, prefix = os.path.split(path)

    if not os.path.isdir(directory):
        return web.json_response({"current": directory, "entries": []})

    entries = []
    try:
        for entry in sorted(os.scandir(directory), key=lambda e: (not e.is_dir(), e.name.lower())):
            if prefix and not entry.name.lower().startswith(prefix.lower()):
                continue
            if entry.is_dir():
                entries.append({"name": entry.name + "/", "path": entry.path + "/", "is_dir": True})
            elif os.path.splitext(entry.name)[1].lower() in VIDEO_EXTS:
                entries.append({"name": entry.name, "path": entry.path, "is_dir": False})
    except PermissionError:
        pass

    return web.json_response({"current": directory, "entries": entries[:100]})


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
    OUTPUT_NODE = True
    FUNCTION = "load_segment"
    CATEGORY = "video"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def load_segment(self, video_path, frames_per_segment, current_segment, unique_id):
        video_path = os.path.expanduser(video_path)
        # Server-side auto-increment: override widget value if we have a tracked index
        if unique_id in loop_indexes:
            current_segment = loop_indexes[unique_id]
        cap = None
        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                print(f"[VideoSplitBatch] ERROR: Video does not exist or cannot be opened: {video_path}")
                raise InterruptProcessingException()
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            total_segments = math.ceil(total_frames / frames_per_segment)

            start_frame = current_segment * frames_per_segment
            end_frame = min(start_frame + frames_per_segment, total_frames)

            if start_frame >= total_frames:
                print(f"[VideoSplitBatch] {video_path}: All segments done ({total_segments} total)")
                raise InterruptProcessingException()

            print(f"[VideoSplitBatch] {video_path}: Frames {start_frame}\u2013{end_frame-1} | Segment {current_segment+1}/{total_segments}")

            cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

            frames = []
            for i in range(start_frame, end_frame):
                ret, frame = cap.read()
                if not ret:
                    break
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frame = frame.astype(np.float32) / 255.0
                frames.append(frame)

            if not frames:
                raise InterruptProcessingException()
            images = torch.from_numpy(np.stack(frames))
        finally:
            if cap is not None:
                cap.release()

        next_segment = current_segment + 1
        loop_indexes[unique_id] = next_segment
        return {"ui": {"next_segment": [next_segment], "total_segments": [total_segments]},
                "result": (images, current_segment, total_segments)}


NODE_CLASS_MAPPINGS = {"VideoSplitBatch": VideoSplitBatch}
NODE_DISPLAY_NAME_MAPPINGS = {"VideoSplitBatch": "Video Split Batch"}
