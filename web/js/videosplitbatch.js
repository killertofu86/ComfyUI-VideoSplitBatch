import { api } from "../../../scripts/api.js";
import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "VideoSplitBatch",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "VideoSplitBatch") return;

        // --- Auto-increment current_segment after execution via ui return ---
        const origExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            origExecuted?.apply(this, arguments);
            if (message?.next_segment) {
                const segWidget = this.widgets?.find(w => w.name === "current_segment");
                if (segWidget) {
                    segWidget.value = message.next_segment[0];
                    app.graph.setDirtyCanvas(true);
                }
            }
        };

        // --- Browse button for video_path ---
        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origCreated?.apply(this, arguments);

            const node = this;
            const pathWidget = node.widgets?.find(w => w.name === "video_path");
            if (!pathWidget) return;

            // Modal overlay
            const overlay = document.createElement("div");
            Object.assign(overlay.style, {
                position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
                background: "rgba(0,0,0,0.5)", zIndex: "10000", display: "none",
                justifyContent: "center", alignItems: "center",
            });

            const modal = document.createElement("div");
            Object.assign(modal.style, {
                background: "#1e1e1e", border: "1px solid #555", borderRadius: "8px",
                padding: "12px", color: "#ddd", fontFamily: "monospace", fontSize: "13px",
                minWidth: "450px", maxWidth: "600px", maxHeight: "70vh",
                display: "flex", flexDirection: "column",
            });

            const header = document.createElement("div");
            Object.assign(header.style, {
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: "8px", paddingBottom: "8px", borderBottom: "1px solid #444",
            });
            const pathLabel = document.createElement("span");
            pathLabel.style.fontWeight = "bold";
            const closeBtn = document.createElement("button");
            closeBtn.textContent = "\u2715";
            Object.assign(closeBtn.style, {
                background: "none", border: "none", color: "#ddd",
                fontSize: "18px", cursor: "pointer",
            });
            closeBtn.onclick = () => overlay.style.display = "none";
            header.appendChild(pathLabel);
            header.appendChild(closeBtn);

            const listContainer = document.createElement("div");
            Object.assign(listContainer.style, {
                overflowY: "auto", flex: "1", maxHeight: "55vh",
            });

            modal.appendChild(header);
            modal.appendChild(listContainer);
            overlay.appendChild(modal);
            overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = "none"; };
            document.body.appendChild(overlay);

            // Cleanup overlay on node removal
            const origRemoved = node.onRemoved;
            node.onRemoved = function () {
                overlay.remove();
                origRemoved?.apply(this, arguments);
            };

            const navigateTo = async (path) => {
                try {
                    const resp = await api.fetchApi(
                        "/videosplitbatch/browse?path=" + encodeURIComponent(path)
                    );
                    const data = await resp.json();
                    pathLabel.textContent = data.current;
                    listContainer.innerHTML = "";

                    // Parent directory entry
                    if (data.current !== "/") {
                        const parentPath = data.current.replace(/\/[^/]+\/?$/, "/");
                        const parentRow = createRow("\uD83D\uDCC1 ..", true);
                        parentRow.onclick = () => navigateTo(parentPath);
                        listContainer.appendChild(parentRow);
                    }

                    for (const entry of data.entries) {
                        const row = createRow(
                            (entry.is_dir ? "\uD83D\uDCC1 " : "\uD83C\uDFAC ") + entry.name,
                            entry.is_dir
                        );
                        if (entry.is_dir) {
                            row.onclick = () => navigateTo(entry.path);
                        } else {
                            row.onclick = () => {
                                pathWidget.value = entry.path;
                                pathWidget.callback?.(entry.path);
                                overlay.style.display = "none";
                                app.graph.setDirtyCanvas(true);
                            };
                        }
                        listContainer.appendChild(row);
                    }
                } catch (e) {
                    console.warn("[VideoSplitBatch] browse failed", e);
                }
            };

            const createRow = (text, isDir) => {
                const row = document.createElement("div");
                row.textContent = text;
                Object.assign(row.style, {
                    padding: "4px 8px", cursor: "pointer", borderRadius: "3px",
                    color: isDir ? "#6cb6ff" : "#ddd",
                });
                row.onmouseenter = () => row.style.background = "#333";
                row.onmouseleave = () => row.style.background = "";
                return row;
            };

            // Sync manual current_segment changes to server
            const segWidget = node.widgets?.find(w => w.name === "current_segment");
            if (segWidget) {
                const origCallback = segWidget.callback;
                segWidget.callback = function (value) {
                    origCallback?.apply(this, arguments);
                    api.fetchApi("/videosplitbatch/reset?id=" + node.id + "&value=" + Math.round(value));
                };
            }

            // Add Browse button widget
            const browseWidget = node.addWidget("button", "Browse Video", null, () => {
                const startPath = pathWidget.value || "~/";
                overlay.style.display = "flex";
                navigateTo(startPath);
            });
            browseWidget.serialize = false;
        };
    },
});
