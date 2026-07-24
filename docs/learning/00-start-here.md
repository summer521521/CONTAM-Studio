# 00 从这里开始

CONTAM Studio 是一个 Windows 优先、离线优先的 CONTAM 工作台。它不重写 ContamX 求解器，也不把任意 PRJ 当成可编辑文本。

一次安全操作可以理解为：

```text
点击 -> React界面 -> Tauri/Rust可信主机 -> Python语义核心 -> 官方ContamX/SimRead -> 结果与证据
```

先使用 `fixtures/contam/official-contamxpy/valThreeZonesWthCtm-UseApi.prj`，不要使用用户唯一项目。打开时记录文件哈希、Zone数量和只读边界；看见 `supported_readonly` 并不代表内容丢失，而是未知内容被保留。

问题：为什么“不能编辑”有时是安全结论，而不是产品故障？
