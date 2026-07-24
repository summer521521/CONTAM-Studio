# 04 Python 语义核心

Python 读取严格 Profile：DocumentEnvelope 保留字节和行证据，Level/Zone、气流路径、Schedule、Species 和 Companion 模型只暴露有来源的字段。未知区块保持 opaque 或让项目进入只读/不兼容。

运行项目解释器测试：

```powershell
python\.venv\Scripts\python.exe -m pytest -q python\tests\test_supported_domain.py
```

先比较三个官方夹具的状态，再查看 `test_GetPrjInfo.prj` 为什么由于控制/duct 内容只读。

问题：为什么“尽量解析一点”可能比“整体只读”更危险？
