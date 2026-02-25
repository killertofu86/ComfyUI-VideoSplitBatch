import cv2
import numpy as np
import torch

class VideoSplitBatch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            required: {
                video_path: (STRING, {default: }),
                frames_per_segment: (INT, {default: 121, min: 1, max: 9999}),
                current_segment: (INT, {default: 0, min: 0, max: 9999}),
            }
        }

    RETURN_TYPES = (IMAGE, INT, INT)
    RETURN_NAMES = (images, segment_index, total_segments)
    FUNCTION = load_segment
    CATEGORY = video

    def load_segment(self, video_path, frames_per_segment, current_segment):
        # TODO: Kernlogik
        pass


NODE_CLASS_MAPPINGS = {VideoSplitBatch: VideoSplitBatch}
NODE_DISPLAY_NAME_MAPPINGS = {VideoSplitBatch: Video