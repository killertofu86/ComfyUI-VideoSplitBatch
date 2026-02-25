import { api } from "../../../scripts/api.js";
import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "VideoSplitBatch",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "VideoSplitBatch") return;

        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origCreated?.apply(this, arguments);

            const pathWidget = this.widgets?.find(w => w.name === "video_path");
            if (!pathWidget) return;

            // Autocomplete dropdown
            const dropdown = document.createElement("ul");
            Object.assign(dropdown.style, {
                position: "fixed",
                background: "#1e1e1e",
                border: "1px solid #555",
                color: "#ddd",
                listStyle: "none",
                margin: "0",
                padding: "4px 0",
                zIndex: "9999",
                maxHeight: "200px",
                overflowY: "auto",
                fontFamily: "monospace",
                fontSize: "12px",
                display: "none",
                minWidth: "300px",
            });
            document.body.appendChild(dropdown);

            let debounceTimer = null;

            const fetchSuggestions = async (value) => {
                try {
                    const resp = await api.fetchApi(
                        "/videosplitbatch/autocomplete?path=" + encodeURIComponent(value)
                    );
                    return await resp.json();
                } catch {
                    return [];
                }
            };

            const showDropdown = (suggestions, inputEl) => {
                dropdown.innerHTML = "";
                if (!suggestions.length) {
                    dropdown.style.display = "none";
                    return;
                }
                const rect = inputEl.getBoundingClientRect();
                Object.assign(dropdown.style, {
                    display: "block",
                    top: (rect.bottom + window.scrollY) + "px",
                    left: (rect.left + window.scrollX) + "px",
                    width: rect.width + "px",
                });
                for (const s of suggestions) {
                    const li = document.createElement("li");
                    li.textContent = s;
                    Object.assign(li.style, { padding: "3px 8px", cursor: "pointer" });
                    li.addEventListener("mouseenter", () => li.style.background = "#333");
                    li.addEventListener("mouseleave", () => li.style.background = "");
                    li.addEventListener("mousedown", (e) => {
                        e.preventDefault();
                        pathWidget.value = s;
                        dropdown.style.display = "none";
                    });
                    dropdown.appendChild(li);
                }
            };

            // Patch widget callback to intercept typing
            const origCallback = pathWidget.callback;
            pathWidget.callback = function (value) {
                origCallback?.call(this, value);
            };

            // Hook into widget input element when it gets focus
            const origDraw = pathWidget.draw;
            pathWidget.inputEl?.addEventListener("input", (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    const suggestions = await fetchSuggestions(e.target.value);
                    showDropdown(suggestions, e.target);
                }, 200);
            });

            pathWidget.inputEl?.addEventListener("blur", () => {
                setTimeout(() => dropdown.style.display = "none", 150);
            });

            // Also hook after widget is rendered (ComfyUI creates inputEl lazily)
            const patchInput = () => {
                if (!pathWidget.inputEl) return;
                if (pathWidget._vsb_patched) return;
                pathWidget._vsb_patched = true;
                pathWidget.inputEl.addEventListener("input", async (e) => {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(async () => {
                        const suggestions = await fetchSuggestions(e.target.value);
                        showDropdown(suggestions, e.target);
                    }, 200);
                });
                pathWidget.inputEl.addEventListener("blur", () => {
                    setTimeout(() => dropdown.style.display = "none", 150);
                });
            };

            // Poll briefly until inputEl exists
            const poll = setInterval(() => {
                patchInput();
                if (pathWidget._vsb_patched) clearInterval(poll);
            }, 100);
        };
    },

    // Auto-update current_segment after each execution
    async setup() {
        api.addEventListener("executed", async (event) => {
            const nodeId = String(event.detail?.node);
            const graph = app.graph;
            if (!graph) return;
            const node = graph.getNodeById(parseInt(nodeId));
            if (!node || node.comfyClass !== "VideoSplitBatch") return;

            try {
                const resp = await api.fetchApi(
                    "/videosplitbatch/loop-index?id=" + nodeId
                );
                const data = await resp.json();
                const segWidget = node.widgets?.find(w => w.name === "current_segment");
                if (segWidget) {
                    segWidget.value = data.segment;
                    app.graph.setDirtyCanvas(true);
                }
            } catch (e) {
                console.warn("[VideoSplitBatch] loop-index fetch failed", e);
            }
        });
    },
});
