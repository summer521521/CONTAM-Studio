# 02 前端

React 负责交互和渲染，不负责文件路径、原始 PRJ、稳定 ID、进程或可信成功。控制器分为 Project、Draft、Run、Result、只读 AI；根 App 负责组合和布局。

查看 `src/app` 中的桌面 API 和控制器测试，重点观察请求 ID、generation、失效响应和 Patch review modal。手动验收仍需用户完成，自动测试只能证明状态转换契约。

问题：为什么一个晚到的响应不能直接更新当前选中的 Zone？
