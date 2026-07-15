# Gravuresse vNext UI 原型

## 打开方式

直接打开：

```text
docs/prototypes/gravuresse-vnext-prototype.html
```

也可以用静态服务器：

```bash
python3 -m http.server 8765
```

然后访问：

```text
http://127.0.0.1:8765/docs/prototypes/gravuresse-vnext-prototype.html
```

## 核心屏幕

| 屏幕 | URL 参数 | 截图 |
|---|---|---|
| 项目首页 | `?screen=home` | `screens/01-project-home.png` |
| Pipeline | `?screen=pipeline` | `screens/02-pipeline.png` |
| 无限画布 | `?screen=canvas` | `screens/03-infinite-canvas.png` |
| 连接与能力 | `?screen=connections` | `screens/04-connections.png` |

## 可交互内容

- 项目、Pipeline、无限画布、连接四屏切换；
- Pipeline 一键展开为画布；
- 候选结果切换；
- 会话切换、新建和 Fork；
- Agent 计划展开、运行和停止；
- 黑盒、灰盒、白盒检查器切换；
- 灰盒稳定锁；
- 新建项目模式弹层；
- 连接能力与安全边界详情。

## 原型边界

该文件用于产品与交互验证，不连接真实 Provider，不写入项目数据，也不代表最终工程组件结构。正式实现以：

- `docs/PRD.md`
- `docs/SPEC.md`
- `docs/UI-GUIDELINES.md`
- `DESIGN.md`

为准。

## 视觉素材

`assets/rain-city-red-umbrella.png` 由图像模型生成，仅作为原型中的媒体占位内容，不代表最终内置素材或产品品牌资产。
