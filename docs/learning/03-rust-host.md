# 03 Rust 主机

Tauri/Rust 是可信边界：验证命令参数、选择器结果、路径包含关系、Revision、进程、OwnedArtifactStore 和前端可见安全视图。它不负责重新解释完整 CONTAM 科学语义。

从 `src-tauri/src/zone_bridge.rs` 追踪一次 Zone volume Patch：前端只传稳定 ID和意图，Rust 重新绑定当前Revision，再调用 Python 的确定性计划/应用路径。

问题：为什么 WebView 不能提交 `source_path` 或 `byte_start`？
