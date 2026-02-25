import cv2
import numpy as np
import torch
import math
import os
from aiohttp import web
from server import PromptServer
from comfy.model_management import InterruptProcessingException

loop_indexes = {}  # Modul-Ebene

VIDEO_EXTS = {".mp4", ".webm", ".mkv", ".avi", ".mov"}

@PromptServer.instance.routes.get("/videosplitbatch/autocomplete")
async def autocomplete(request):
    path = request.query.get("path", "")
    path = os.path.expanduser(path)

    if os.path.isdir(path):
        directory, prefix = path, ""
    else:
        directory, prefix = os.path.split(path)

    if not os.path.isdir(directory):
        return web.json_response([])

    results = []
    try:
        entries = sorted(os.scandir(directory), key=lambda e: (not e.is_dir(), e.name))
    except PermissionError:
        return web.json_response([])
    for entry in entries:
        if not entry.name.startswith(prefix):
            continue
        if entry.is_dir():
            results.append(entry.path + "/")
        elif os.path.splitext(entry.name)[1].lower() in VIDEO_EXTS:
            results.append(entry.path)

    return web.json_response(results[:50])

@PromptServer.instance.routes.get("/videosplitbatch/loop-index")
async def get_loop_index(request):
    node_id = request.query.get("id", "")
    return web.json_response({"segment": loop_indexes.get(node_id, 0)})

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

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def load_segment(self, video_path, frames_per_segment, current_segment, unique_id):
        video_path = os.path.expanduser(video_path)
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

            print(f"[VideoSplitBatch] {video_path}: Frames {start_frame}–{end_frame-1} | Segment {current_segment+1}/{total_segments}")

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

            if not frames:
                raise InterruptProcessingException()
            images = torch.from_numpy(np.stack(frames))
        finally:
            if cap is not None:
                cap.release()
        return (images, current_segment, total_segments)


NODE_CLASS_MAPPINGS = {"VideoSplitBatch": VideoSplitBatch}
NODE_DISPLAY_NAME_MAPPINGS = {"VideoSplitBatch": "Video Split Node"}