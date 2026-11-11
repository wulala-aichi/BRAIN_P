# 论文配色与色条（3.15.0）

本次共有21种数值色带，以及4套分类配色（含原配色）。不需要联网使用；新增色值已经嵌入HTML。

## 在哪里使用

- 主界面“伪彩色带”：按用途分组选择，下方显示色带预览与适用说明；2D和3D同步使用。
- 主脑图需使用“自定义赋值”层并有脑区数值；仅切换色带不会把Allen解剖色伪装成定量数据。
- 研究工作台：AAV、MERFISH连续表达、NIfTI影像与条件矩阵的色带列表同步扩展。
- 研究工作台“点与定量”“组间比较”：分类配色可选原有、NPG、AAAS、Okabe–Ito，用于组别点和动物散点。两个入口共享设置；不会改变MERFISH原始细胞类型颜色或Allen解剖颜色。
- 原有反转、等宽分级、固定范围、自定义刻度、方向/位置和SVG/PDF/PNG/TIFF导出继续可用。已有图版快照不会自动改变，请重新捕获想要的新配色。

## 按数值含义选色

| 数据含义 | 可选色带 |
|---|---|
| 表达、信号、密度等单向强度 | Viridis、Inferno、Plasma、Magma、Cividis、Teal |
| 白底单色/多色强度 | Blues、Greens、Purples、Oranges、YlOrRd、YlGnBu、Gray |
| 差值、相关、效应量等双向量 | 经典蓝白红、RdBu、PuOr、BrBG、NPG蓝白红 |
| 与期刊风格分类色协调的连续图 | NPG青蓝、NPG珊瑚红、AAAS靛蓝 |

双向色带本身不会自动把0放到中心。需要零中心时勾选“对称范围”，或设定[-a,a]固定范围；已经选择的双向色带会被保留。反转只改变颜色方向，不改变原始数值。比较不同条件时请保持同一指标/单位/范围和配色。

分类配色不进入连续色带选择框。NPG/AAAS分别有10色，Okabe–Ito有8色；组数超过色数会循环复用，建议分面。NPG/AAAS并非每对颜色都适用于所有色觉条件，投稿前仍需检查区分度。

## 来源与准确命名

NPG与AAAS来自[ggsci的期刊启发配色](https://nanx.me/ggsci/articles/ggsci.html)，并非期刊官方指定。NPG/AAAS数值渐变是本软件基于其中代表色构建的自定义渐变，明确标注，不能与原始分类色板混称。没有把某个自定义配色冒充“Cell官方色板”。

Plasma、Magma、Cividis从[Matplotlib v3.10.0原始LUT](https://github.com/matplotlib/matplotlib/blob/v3.10.0/lib/matplotlib/_cm_listed.py)各取33个等距采样点，转为8位sRGB后线性插值；ColorBrewer使用[官方公开色值](https://colorbrewer2.org/)。原有四种色带的定义保持不变。所有来源链接随静态色板数据保留在 `data/publication-palettes.js`。

[Nature图像规范](https://research-figure-guide.nature.com/figures/preparing-figures-our-specifications/)强调可访问配色、清晰单位/刻度和可编辑图形，不是统一的CNS色板清单；配色的顺序、双向或分类语义参考[Matplotlib官方指南](https://matplotlib.org/stable/users/explain/colors/colormaps.html)。
