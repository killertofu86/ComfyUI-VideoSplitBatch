# ComfyUI-VideoSplitBatch

A ComfyUI custom node that splits a video into segments sequentially — one segment per queue run — to minimize RAM usage.

## Motivation

Loading all frames at once causes 18–30GB swap on machines with 32GB RAM. This node processes one segment at a time, fully releasing RAM between runs.

## Node: VideoSplitBatch

### Inputs
-  (string)
-  (int, e.g. 121)
-  (int, auto-increments)

### Outputs
-  — IMAGE batch for current segment
-  — INT for output filenames

## Installation


