# BRAIN_P — Mouse Atlas Studio

Local-first mouse brain atlas, regional-data and NIfTI research visualization. **Research Beta: 3.20.0-beta.1.**

本工具用于研究结果展示和可复现图版制作，不是完整MRI分析流水线，也不是MRIcroGL的完整替代品。当前版本不用于诊断、手术定位或自动得出科学结论。

## 五分钟启动 / Quick start

安装Node.js 22或24，下载或克隆本仓库。在仓库目录运行：

```sh
node scripts/test.mjs
node build.mjs
node scripts/serve.mjs
```

然后访问终端给出的`http://127.0.0.1:8766/`，推荐近期Chrome或Edge。也可直接打开构建后的`dist/index.html`。构建无需npm第三方包或R；带npm的环境可用`npm ci --ignore-scripts && npm run verify && npm start`。

前端构建会生成约87 MB单文件HTML，首次加载及内存占用可能较高。发布包/CI构建产物会另行提供；源码仓库不追踪dist。不要把未完成的CI或尚未创建的Release误认为已经验证的下载版。

## 从模拟数据上手

```sh
node scripts/generate-example.mjs
```

- 常规图谱→数据：导入`examples/generated/SIMULATED_regional_values.csv`；其中ACAd=0是有效值，DG=NA是缺失值，不应混同。
- MRI / 统计NIfTI：加载生成的`SIMULATED_template.nii`与`SIMULATED_statistic.nii`，用原始数值阈值显示。模板是椭球体phantom，不是真实小鼠解剖；统计图不代表任何动物实验或显著性检验。
- 调整色条/布局→导出图像→保存项目，重开项目检查复现。

## 功能与边界

| 功能 | Beta状态 |
|---|---|
| Allen冠状/矢状/水平图谱、行列/片层/间距、区域CSV赋值、0/NA、L/R/B | 核心；含自动回归 |
| 本地NIfTI模板/统计图、4D帧、t/Z/F与概率图显示、阈值、簇范围、平滑 | 核心候选；需核对空间、统计类型、平滑和阈值顺序；不执行配准或自动校正 |
| 2D/3D显示、色条、图版、SVG/PNG/PDF/TIFF、项目保存 | Beta；WebGL/浏览器差异仍需用户反馈 |
| 点、ROI、网络、位点/电极/光纤示意和研究工作台 | 实验性；硬件图形不是制造商CAD或手术计划 |
| 大型本地MERFISH/AAV数据桥 | 可选、实验性；需另装Python依赖与自行下载数据 |
| Swanson批量科研结果页 | 不随首版分发；原页含用户真实研究数值，尚未抽成通用模块 |

内置的5个项目派生网络预设已从公开数据包排除，网络/区域导入和绘图代码保留。没有上传个人研究结果、原始NIfTI/H5AD或Excel结果包。

## 坐标、统计与复现

- 浏览步长0.1 mm；2D边界来自原10 µm annotation切面，不代表所有展示/测量都有10 µm有效分辨率。
- 3D网格与点标签查询约100 µm；357结构聚合，356个区域表面；不具备几何的本体细分叶节点不可直接绘制。
- Allen CCF的AP/DV从体积边缘量起；ML依据原始affine。**不是bregma坐标**。
- 缺失值不是0；图谱外、筛选排除、低支持和数值0须分别解释。色条范围不是统计校正。
- NIfTI展示/簇大小过滤不等于FWER/FDR校正；导入q值时责任在上游统计。不要仅凭图像叠加推断已配准。
- 科学处理、显示平滑及几何平滑不是同一操作。保存项目与导出元数据，记录源文件、空间、帧、阈值、掩膜、平滑和色条。

详见[使用说明](docs/使用说明.md)、[界面指南](docs/新版界面上手指南.md)、[MRI指南](docs/MRI_ADVANCED_GUIDE_ZH.md)、[已知限制](docs/KNOWN_LIMITATIONS.md)。历史专题文档可能提及未随公开包提供的数据/启动脚本；以此README和公开版启动脚本为准。

## 可选本地数据服务

不需要它也可使用常规图谱和本地NIfTI展示。

```sh
python -m venv .venv
# 按系统激活.venv；然后：
python -m pip install -r requirements.txt
python tools/merfish_server.py --root /path/to/abc_atlas
```

Windows可用`powershell -File scripts/start-local-data.ps1 -Root <你的数据目录> -Python <虚拟环境python路径>`。AAV目录通过重复`--aav-root`参数指定。服务仅监听127.0.0.1；不要暴露公网。Python依赖当前为兼容范围，不是完整跨平台锁定环境；外部数据缺失时会明确报错。

前端核心不上传用户图像。服务在本机读取文件；完整项目JSON可能嵌入加载的数据、文件名和来源路径，分享前应检查。GitHub Pages只是静态前端，不能运行Python桥接；首版不承诺网页远程连接本机服务。

## 开发、测试和支持

核心测试无R依赖；Welch参考值由独立R脚本预生成。CI配置为Windows/Linux、Node22/24的回归和构建；实际通过状态以Actions为准。公开包不包含依赖作者outputs目录的历史截图/产物回归，也不宣称所有模块完成端到端跨浏览器验证。

请通过[Issues](https://github.com/wulala-aichi/BRAIN_P/issues)提交可复现问题，不要公开上传敏感原始数据。见[发布标准](docs/RELEASE_CRITERIA.md)、[贡献指南](CONTRIBUTING.md)、[安全说明](SECURITY.md)、[版本记录](CHANGELOG.md)。

## 许可与引用

原创代码由wulala-aichi按[MIT](LICENSE)授权。**MIT不覆盖第三方库、字体或Allen衍生图谱数据**。使用和再分发请分别遵守[第三方说明](THIRD_PARTY_NOTICES.md)及[图谱数据条款](DATA_LICENSES.md)。包含Allen数据资产的组合包不能理解为全部内容均允许无条件商用。

请引用实际使用的Allen/软件资源；`CITATION.cff`提供本项目软件引用信息。本软件不是Allen Institute、IBL、MRIcroGL或期刊的官方产品。
