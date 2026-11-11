# BRAIN_P v3.20.0-beta.1

小鼠脑图谱与NIfTI结果展示工具，支持区域数值赋值、统计图叠加、三维显示和图版导出。

## 下载和使用

下载 `BRAIN_P-3.20.0-beta.1-offline.zip`，解压后用Chrome或Edge打开 `index.html`。图谱与NIfTI功能无需安装Node或Python。文件校验值见 `SHA256SUMS.txt`。

**Source code** 为开发源码，构建步骤和出图示例见[仓库首页](https://github.com/wulala-aichi/BRAIN_P)。随包提供的NIfTI示例是合成椭球体及模拟数值。

## 本版内容

- Allen图谱切片、区域CSV赋值和三维脑区显示。
- 本地NIfTI模板、统计图、掩膜和4D帧选择。
- 阈值、簇范围、平滑、色条和图版设置。
- SVG、PNG、PDF、TIFF导出与完整项目保存。

33项核心回归和构建已在Windows/Linux × Node 22/24四组CI中通过。软件仍为研究Beta，MERFISH/AAV本地服务及高级研究流程作为实验性功能提供。

统计图需要预先配准到模板空间。簇大小过滤不等于多重比较校正；CCF坐标不是bregma坐标。本工具不用于临床诊断或手术规划。

原创代码采用MIT；Allen图谱、字体和第三方库遵守随包附带的各自条款。
