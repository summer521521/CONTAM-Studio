# Phase 5B-1 Zone结果桌面摘要

## 范围

Phase 5B-1把一个已打开的受支持PRJ、当前Zone和用户主动选择的Phase 4成功运行清单连接到现有Phase 5A `zone_air_state` 提取接口。桌面只显示当前Zone的真实摘要与可滚动样本表格，不运行ContamX。

```text
React（request_id、project_session_id、Zone编号）
↓ Tauri invoke
Rust（原生选择Phase 4 manifest、活动项目会话、应用本地结果根目录）
↓ 一次性JSON桥
Python zone_bridge
↓
extract_zone_air_state（Phase 4 manifest → SimRead → 严格NFR）
```

## 路径与身份边界

React不能提交PRJ、manifest、SIM、SimRead或结果目录路径。Rust只接受当前内存中的项目session和Zone编号，原生JSON对话框取得manifest路径；结果提取根目录由Tauri `app_local_data_dir()/result-extractions`确定。Python在启动SimRead前验证Phase 4 manifest属于当前项目、源SHA-256一致且Zone存在，Phase 5A继续负责其余证据复核。

取消manifest选择不是错误，不启动Python。错误不会把其他项目或其他Zone的部分结果交给WebView。Rust验证协议、request_id、Zone身份、样本数量、有限数值、单调时间和`day_type=null`后才返回安全结果视图；Python原始路径和诊断文本不进入界面。

结果加载阶段与真实宿主操作对应：点击后先进入`selecting`，Rust取得有效manifest路径后通过Tauri事件发送仅含`request_id`和固定`loading`阶段的通知，再启动Python提取。React只接受当前活动request的通知，旧request和组件卸载后的通知不会改变状态。该事件使用现有`core:event:default`监听能力，不新增dialog前端、文件系统、Shell、HTTP或网络权限。

同一项目、同一Zone已有成功结果时，新一轮选择取消或提取失败不会丢弃旧结果。界面继续显示旧摘要和表格，并单独显示“本次加载已取消”或经稳定错误码映射的失败提示；项目或Zone改变时结果和提示一起清除。

## 结果契约

桌面只接受`result_type=zone_air_state`、SI单位和严格Phase 5A样本字段：累计秒、温度K、参考压力Pa、空气密度kg/m³、日类型。官方NFR没有CONTAM日类型，界面显示`—`并保留机器可读的`day_type_source`说明。结果提取目录、运行清单和SimRead生成物由Python证据链管理，不写入源项目目录。

## 当前不支持

不支持任意SIM/NFR、ContamX运行按钮、曲线、导出、多Zone或多运行比较、路径流量、污染物、AI、长期Python服务和结果自动清理。session只在本次应用内存中有效，不是稳定UUID。
