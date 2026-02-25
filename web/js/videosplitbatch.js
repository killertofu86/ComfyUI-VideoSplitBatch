import { api } from "../../../scripts/api.js";
import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "VideoSplitBatch",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "VideoSplitBatch") return;

        // --- Auto-increment current_segment after execution (robust: onExecuted on prototype) ---
        const origExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            origExecuted?.apply(this, arguments);
            const node = this;
            api.fetchApi("/videosplitbatch/loop-index?id=" + node.id)
                .then(r => r.json())
                .then(data => {
                    const segWidget = node.widgets?.find(w => w.name === "current_segment");
                    if (segWidget) {
                        segWidget.value = data.segment;
                        app.graph.setDirtyCanvas(true);
                    }
                })
                .catch(e => console.warn("[VideoSplitBatch] loop-index fetch failed", e));
        };

        // --- Autocomplete for video_path ---
        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            origCreated?.apply(this, arguments);

            const node = this;
            const pathWidget = node.widgets?.find(w => w.name === "video_path");
            if (!pathWidget) return;

            // Dropdown element
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
                    top: (rect.bottom + 4) + "px",
                    left: rect.left + "px",
                    width: Math.max(rect.width, 300) + "px",
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
                        pathWidget.callback?.(s);
                        if (pathWidget.inputEl) pathWidget.inputEl.value = s;
                        dropdown.style.display = "none";
                        // Directory selected → trigger another autocomplete
                        if (s.endsWith("/")) {
                            clearTimeout(debounceTimer);
                            debounceTimer = setTimeout(async () => {
                                const sug = await fetchSuggestions(s);
                                if (pathWidget.inputEl) showDropdown(sug, pathWidget.inputEl);
                            }, 50);
                        }
                    });
                    dropdown.appendChild(li);
                }
            };

            // Patch inputEl once it exists: attach autocomplete listeners
            const patchInputEl = (el) => {
                if (el._vsb_patched) return;
                el._vsb_patched = true;

                el.addEventListener("input", () => {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(async () => {
                        const suggestions = await fetchSuggestions(el.value);
                        showDropdown(suggestions, el);
                    }, 200);
                });

                el.addEventListener("blur", () => {
                    setTimeout(() => dropdown.style.display = "none", 200);
                });

                el.addEventListener("focus", () => {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(async () => {
                        const suggestions = await fetchSuggestions(el.value);
                        showDropdown(suggestions, el);
                    }, 100);
                });
            };

            // Intercept inputEl being set by ComfyUI (it's created lazily on click)
            let _inputEl = pathWidget.inputEl || null;
            Object.defineProperty(pathWidget, "inputEl", {
                set(el) {
                    _inputEl = el;
                    if (el) patchInputEl(el);
                },
                get() { return _inputEl; },
                configurable: true,
            });
            // If inputEl already exists at creation time, patch it now
            if (_inputEl) patchInputEl(_inputEl);
        };
    },
});
