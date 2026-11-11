(function () {
  "use strict";
  const data = window.MOUSE_ATLAS_DATA;
  const utils = window.AtlasUtils;
  const valueTools = window.AtlasValues;
  const pro = window.AtlasProfessional;
  const sliceDepth = window.AtlasSliceDepth;
  const colorbars=window.AtlasColorbar;
  const namespace = "http://www.w3.org/2000/svg";
  const storageKey = "brain-p-public-studio.v1";
  const elements = Object.fromEntries([...document.querySelectorAll("[id]")].map(element => [element.id, element]));
  valueTools.mountMapSelect(elements.customMap);
  const icons = () => window.lucide?.createIcons({attrs: {"stroke-width": 1.7}});
  icons();
  function error(message) {
    elements.errorBanner.textContent = message;
    elements.errorBanner.hidden = false;
    elements.loading.hidden = true;
  }
  if (!data || !utils || !valueTools || !pro || !Array.isArray(data.ontology) || !window.Papa || !window.DecompressionStream) {
    error("图谱未能初始化。请使用较新版本的 Chrome、Edge 或 Tabbit 打开完整 HTML 文件。");
    return;
  }
  const decoded = new Map();
  const familyKeys = [...new Set(data.regions.map(region => region.family).filter(Boolean))];
  const renderableIds = new Set(data.regions.flatMap(region => [region.structureId,...region.ancestors]).filter(id => id !== null));
  const ontologyChildren = new Map();
  for (const node of data.ontology) {if(!ontologyChildren.has(node.parentId))ontologyChildren.set(node.parentId,[]);ontologyChildren.get(node.parentId).push(node);}
  let treeQuery = "", treeKey = null;
  const textMeasure = document.createElement("canvas").getContext("2d");
  const anchorCache = new Map();
  let editorKey = "", regionQuery = "";
  let importHistory = [];
  let generation = 0, playback = null, readyPromise = Promise.resolve(), currentSvg = null;
  let meshViewer=null,meshPromise=null,meshPicked=null,research=null,publication=null,nifti=null,advancedMRI=null,colorbarEditor=null,smoothingTimer=null;
  function selection(orientation, count = 8) {
    const positions = {
      coronal: [2, 3.2, 4.4, 5.6, 6.8, 8, 9.2, 10.4],
      sagittal: [-4, -2.8, -1.6, -0.4, 0.4, 1.6, 2.8, 4],
      horizontal: [1, 1.8, 2.6, 3.4, 4.2, 5, 5.8, 6.6]
    };
    const base = positions[orientation];
    const samples = Array.from({length: count}, (_, index) =>
      count === 1 ? (base[0] + base.at(-1)) / 2 : base[0] + (base.at(-1) - base[0]) * index / (count - 1));
    return samples.map(position => utils.closestSlice(data.planes[orientation].slices, position));
  }
  function defaults() {
    return {orientation: "coronal", mode: "grid", selected: selection("coronal"), active: 4,
      layer: "anatomy", palette: "allen", fillOpacity: 100,
      borders: false, lineWidth: 0.1, outline: false, outlineWidth: 0.4,
      lineColour: "#637077", transparent: true, background: "#ffffff",
      showLabels: true, showScale: true, paperWidth: 183, dpi: 300, rows: 2, columns: 4, zoom: 100,publicationStyle:false,
      panelGapX:24,panelGapY:24,intervalStart:2,intervalMm:1.2,
      showRegionNames: true, regionNameFormat: "acronym", regionNameDensity: "sparse", regionNameSize: 4.5,
      values: {}, familyValues: {}, structureValues: {}, statistics: {}, selectedStructures: [], selectionOnly: false, crosshair:{ap:6.8,ml:.005,dv:4},showCrosshair:true,camera3d:{yaw:.65,pitch:.5,radius:23,target:[0,0,0]},shellOpacity:8,show3dPlanes:false,coordinateMode:'none',planeVisibility:{coronal:true,sagittal:true,horizontal:true},hemisphere: "B", assignmentHemisphere: "B", assignmentTarget: "region", customMap: "viridis",
      autoRange: true, symmetricRange: false, statFilter: "none", statThreshold: .05, absoluteThreshold: 0,
      smoothing3d:100,...sliceDepth.defaults(),colorbar:colorbars.defaults(),
      valueKind: "value", valueUnit: "", projectName:'Mouse Atlas Project',projectSource:'',projectNotes:'',valueMin: 0, valueMax: 1, valueTitle: "Value", missingColour: "#e0e3e4"};
  }
  function sanitise(input) {
    const output = defaults();
    if (!input || typeof input !== "object") return output;
    Object.assign(output,sliceDepth.clean(input));
    output.colorbar=colorbars.clean(input.colorbar);
    if (Object.hasOwn(data.planes, input.orientation)) output.orientation = input.orientation;
    const intervalDefaults={coronal:[2,1.2],sagittal:[-4,1.1],horizontal:[1,.8]}[output.orientation];
    output.intervalStart=Number.isFinite(input.intervalStart)?input.intervalStart:intervalDefaults[0];
    output.intervalMm=Number.isFinite(input.intervalMm)?input.intervalMm:intervalDefaults[1];
    for(const key of ['panelGapX','panelGapY'])if(Number.isFinite(input[key]))output[key]=utils.clamp(Math.round(input[key]),0,100);
    if (Number.isFinite(input.columns)) output.columns = utils.clamp(Math.round(input.columns), 1, 8);
    if (Number.isFinite(input.rows)) output.rows = utils.clamp(Math.round(input.rows), 1, 8);
    else if (Array.isArray(input.selected) && input.selected.length) {
      // Older projects stored only the column count and eight selected slices.
      output.rows = utils.clamp(Math.ceil(input.selected.length / output.columns), 1, 8);
    }
    const panelCount = output.rows * output.columns;
    const seeds = selection(output.orientation, panelCount);
    const maximumSlice = data.planes[output.orientation].slices.length - 1;
    output.selected = Array.isArray(input.selected) ? input.selected.slice(0, panelCount).map((value, index) =>
      Number.isFinite(value) ? utils.clamp(Math.round(value), 0, maximumSlice) : seeds[index]) : [];
    while (output.selected.length < panelCount) {
      const next = seeds.find(index => !output.selected.includes(index)) ??
        Array.from({length: maximumSlice + 1}, (_, index) => index).find(index => !output.selected.includes(index));
      output.selected.push(next);
    }
    output.mode = ["single","ortho","3d"].includes(input.mode) ? input.mode : "grid";
    if(['none','axes','planes','both'].includes(input.coordinateMode))output.coordinateMode=input.coordinateMode;
    output.show3dPlanes=['planes','both'].includes(output.coordinateMode);
    for(const orientation of ['coronal','sagittal','horizontal'])if(typeof input.planeVisibility?.[orientation]==='boolean')output.planeVisibility[orientation]=input.planeVisibility[orientation];
    if(Number.isFinite(input.shellOpacity))output.shellOpacity=utils.clamp(input.shellOpacity,0,40);
    if(Number.isFinite(input.smoothing3d))output.smoothing3d=utils.clamp(Math.round(input.smoothing3d),0,200);
    if(input.camera3d&&['yaw','pitch','radius'].every(key=>Number.isFinite(input.camera3d[key]))&&Array.isArray(input.camera3d.target)&&input.camera3d.target.length===3&&input.camera3d.target.every(Number.isFinite)){
      output.camera3d={yaw:input.camera3d.yaw,pitch:utils.clamp(input.camera3d.pitch,-Math.PI/2,Math.PI/2),radius:utils.clamp(input.camera3d.radius,10,75),target:input.camera3d.target.map(value=>utils.clamp(value,-30,30))};
    }
    for(const [orientation,axis]of Object.entries({coronal:'ap',sagittal:'ml',horizontal:'dv'})){
      const value=input.crosshair?.[axis];if(Number.isFinite(value))output.crosshair[axis]=data.planes[orientation].slices[utils.closestSlice(data.planes[orientation].slices,value)].position;
    }
    if(typeof input.showCrosshair==='boolean')output.showCrosshair=input.showCrosshair;
    const limits = {active: [0, panelCount - 1], fillOpacity: [20, 100], lineWidth: [0.02, 1.5], outlineWidth: [0.05, 2], paperWidth: [80, 400], zoom: [60, 160], regionNameSize: [3, 9]};
    for (const [key, bounds] of Object.entries(limits)) if (Number.isFinite(input[key])) output[key] = utils.clamp(input[key], ...bounds);
    output.active = utils.clamp(Math.round(output.active), 0, panelCount - 1);
    for (const key of ["borders", "outline", "transparent", "showLabels", "showScale", "showRegionNames", "autoRange","publicationStyle"]) if (typeof input[key] === "boolean") output[key] = input[key];
    for (const key of ["lineColour", "background", "missingColour"]) if (/^#[0-9a-f]{6}$/i.test(input[key])) output[key] = input[key];
    if (["allen", "family", "gray"].includes(input.palette)) output.palette = input.palette;
    if (["anatomy", "custom"].includes(input.layer) || data.networks.some(network => network.id === input.layer)) output.layer = input.layer;
    if ([150, 300, 600].includes(input.dpi)) output.dpi = input.dpi;
    output.values = pro.cleanAssignments(input.values, data.regions.map(region => region.id));
    output.familyValues = pro.cleanAssignments(input.familyValues, familyKeys);
    output.structureValues = pro.cleanAssignments(input.structureValues, [...renderableIds]);
    for(const [target,map] of Object.entries({region:output.values,family:output.familyValues,tree:output.structureValues}))for(const key of Object.keys(map)){
      const stats=input.statistics?.[`${target}:${key}`];if(!stats||typeof stats!=="object")continue;
      const clean={};for(const field of ['p','q','n'])if(Number.isFinite(stats[field])&&(field==='n'?(stats[field]>=1&&Number.isInteger(stats[field])):(stats[field]>=0&&stats[field]<=1)))clean[field]=stats[field];
      output.statistics[`${target}:${key}`]=clean;
    }
    if(typeof input.symmetricRange==='boolean')output.symmetricRange=input.symmetricRange;
    if(['none','value','p','q'].includes(input.statFilter))output.statFilter=input.statFilter;
    if(['value','effect','t','z'].includes(input.valueKind))output.valueKind=input.valueKind;
    if(typeof input.valueUnit==='string')output.valueUnit=input.valueUnit.slice(0,32);
    if(Number.isFinite(input.statThreshold)&&input.statThreshold>=0&&input.statThreshold<=1)output.statThreshold=input.statThreshold;
    if(Number.isFinite(input.absoluteThreshold)&&input.absoluteThreshold>=0)output.absoluteThreshold=input.absoluteThreshold;
    output.selectedStructures = Array.isArray(input.selectedStructures) ? [...new Set(input.selectedStructures.filter(id => renderableIds.has(id)))] : [];
    if(typeof input.selectionOnly === "boolean") output.selectionOnly=input.selectionOnly;
    for (const key of ["hemisphere", "assignmentHemisphere"]) if (pro.hemispheres.includes(input[key])) output[key] = input[key];
    if (["acronym", "full"].includes(input.regionNameFormat)) output.regionNameFormat = input.regionNameFormat;
    if (["sparse", "dense"].includes(input.regionNameDensity)) output.regionNameDensity = input.regionNameDensity;
    if (["family","tree"].includes(input.assignmentTarget)) output.assignmentTarget = input.assignmentTarget;
    if (Object.hasOwn(valueTools.maps, input.customMap)) output.customMap = input.customMap;
    if (Number.isFinite(input.valueMin) && Number.isFinite(input.valueMax) && input.valueMin < input.valueMax) {
      output.valueMin = input.valueMin; output.valueMax = input.valueMax;
    }
    if (typeof input.valueTitle === "string") output.valueTitle = input.valueTitle.slice(0, 64);
    for(const [key,limit]of [['projectName',100],['projectSource',300],['projectNotes',4000]])if(typeof input[key]==='string')output[key]=input[key].slice(0,limit);
    return output;
  }
  let state = defaults();
  try {const stored=JSON.parse(localStorage.getItem(storageKey)); state = sanitise(stored?.state||stored);importHistory=Array.isArray(stored?.imports)?stored.imports:[];} catch {}
  const currentPlane = () => data.planes[state.orientation];
  const coordinateAxis = orientation => ({coronal:'ap',sagittal:'ml',horizontal:'dv'})[orientation];
  const linked=()=>['ortho','3d'].includes(state.mode);
  const currentRecord = () => currentPlane().slices[linked()?utils.closestSlice(currentPlane().slices,state.crosshair[coordinateAxis(state.orientation)]):state.selected[state.active]];
  const currentNetwork = () => data.networks.find(network => network.id === state.layer);
  const customValue = (regionIndex, hemisphere = "B") => pro.resolve(data.regions[regionIndex], hemisphere, state).value;
  const customRange = () => {const base=pro.range(data,state);if(!state.autoRange)return base;const fine=research?.fineRange?.();if(!fine)return base;const assigned=[state.values,state.familyValues,state.structureValues].some(map=>Object.values(map).some(Number.isFinite));return assigned?[Math.min(base[0],fine[0]),Math.max(base[1],fine[1])]:fine;};
  const formatValue = value => Number.isFinite(value) ? Number(value.toPrecision(5)).toString() : "NA";
  function colourSpec(){if(state.layer==='anatomy'||research?.merfishSummary()?.regional||research?.aavSignalOnly())return null;const custom=state.layer==='custom',stops=custom?valueTools.maps[state.customMap].map((colour,i,all)=>({at:i/(all.length-1),colour})):[0,.15,.5,1].map(at=>({at,colour:utils.networkColour(at)}));return{version:2,quantity:custom?state.valueTitle:'Region fraction',title:custom?state.valueTitle:'Region fraction',unit:custom?state.valueUnit:'',kind:custom?state.valueKind:'fraction',map:custom?state.customMap:'network',range:custom?customRange():[0,1],stops,missingColour:state.missingColour,filtered:custom&&state.statFilter!=='none',filter:custom?state.statFilter:'none',threshold:state.statFilter==='value'?state.absoluteThreshold:state.statThreshold};}
  const positionString = (value,orientation=state.orientation) => Number(value).toFixed(orientation === "sagittal" ? 3 : 1);
  function coordinate(record, full = true, orientation=state.orientation) {
    return `${full ? "CCF " : ""}${data.planes[orientation].axis} ${positionString(record.position,orientation)} mm`;
  }
  function persist() { try { localStorage.setItem(storageKey, JSON.stringify({storageVersion:2,state,imports:importHistory})); } catch {elements.projectStatus.textContent='浏览器本地存储空间不足；请点击保存项目保存到文件。';} }
  function syncSliceDepthControls(){
    elements.sliceDepthSection.hidden=state.mode==='3d';
    elements.sliceDepth.checked=state.sliceDepth;elements.sliceDepthControls.hidden=!state.sliceDepth;
    elements.sliceRotationControls.hidden=state.mode!=='single';
    for(const key of ['sliceThickness','sliceShadow','slicePitch','sliceYaw']){
      elements[key].value=state[key];elements[key+'Value'].textContent=Math.round(state[key])+(key==='sliceShadow'?'%':['slicePitch','sliceYaw'].includes(key)?'°':'');
    }
    elements.sliceRotate.checked=state.sliceRotate;
    elements.figure.classList.toggle('slice-rotate-active',state.sliceDepth&&state.mode==='single'&&state.sliceRotate);
    elements.sliceDepthHint.textContent=state.mode==='single'?'拖动旋转需开启模式；绘制ROI时自动让位。倾斜显示不使用普通比例尺；正视可恢复。厚度仅是显示参数，不代表真实组织厚度，正面颜色不加光照。':'网格/三视图保持正视；切换“单片”可调倾角和拖动旋转。厚度仅是显示参数，不代表真实组织厚度，正面颜色不加光照。';
  }
  function intervalPreview(){return utils.intervalSelection(currentPlane().slices,state.rows*state.columns,state.intervalStart,state.intervalMm);}
  function syncSpacingControls(){
    for(const key of ['panelGapX','panelGapY']){
      elements[key].value=state[key];const mm=state[key]*state.paperWidth/1200;
      elements[key+'Value'].textContent=mm.toFixed(2)+' mm';elements[key].setAttribute('aria-valuetext',mm.toFixed(2)+' mm（版面距离）');
    }
    elements.panelGapX.disabled=state.columns===1;elements.panelGapY.disabled=state.rows===1;
    const slices=currentPlane().slices;
    elements.intervalStart.value=state.intervalStart;elements.intervalStart.min=slices[0].position;elements.intervalStart.max=slices.at(-1).position;
    elements.intervalMm.value=state.intervalMm;elements.intervalAxis.textContent=currentPlane().axis;
    const result=intervalPreview();elements.applyInterval.disabled=!result.ok;
    elements.intervalStatus.classList.toggle('spacing-error',!result.ok);
    if(!result.ok){elements.intervalStatus.textContent=result.error+'。未应用，不修改当前片层。';return;}
    const applied=result.indices.length===state.selected.length&&result.indices.every((value,index)=>value===state.selected[index]);
    const number=value=>Number(value.toFixed(3)).toString();
    const span=`${number(result.positions[0])}–${number(result.positions.at(-1))} mm`;
    const steps=result.actualStepMin===null?'':`；实际相邻间隔 ${number(result.actualStepMin)}${Math.abs(result.actualStepMax-result.actualStepMin)>1e-7?'–'+number(result.actualStepMax):''} mm`;
    const snap=result.maxSnapError>1e-7?`；按现有片层吸附，最大偏差 ${number(result.maxSnapError)} mm`:'';
    elements.intervalStatus.textContent=`${applied?'当前已应用':'预览（点击应用）'}：${result.indices.length} 片，${span}${steps}${snap}。`;
  }
  function sync() {
    syncSliceDepthControls();
    syncSpacingControls();
    for (const key of ["orientation", "hemisphere", "assignmentHemisphere", "layer", "palette", "lineWidth", "outlineWidth", "lineColour", "background", "paperWidth", "dpi", "rows", "columns", "zoom", "regionNameFormat", "regionNameDensity", "regionNameSize", "assignmentTarget", "customMap", "valueTitle", "missingColour"]) elements[key].value = state[key];
    for (const key of ["borders", "outline", "transparent", "showLabels", "showScale", "showRegionNames", "autoRange","publicationStyle"]) elements[key].checked = state[key];
    elements.fillOpacity.value = state.fillOpacity;
    elements.opacityValue.textContent = state.fillOpacity + "%";
    elements.lineWidthValue.textContent = state.lineWidth.toFixed(2) + " pt";
    elements.outlineWidthValue.textContent = state.outlineWidth.toFixed(2) + " pt";
    elements.regionNameSizeValue.textContent = state.regionNameSize.toFixed(1) + " pt";
    for (const key of ["regionNameFormat", "regionNameDensity", "regionNameSize"]) elements[key].disabled = !state.showRegionNames;
    const range = customRange();
    elements.valueMin.value = state.autoRange ? formatValue(range[0]) : state.valueMin;
    elements.valueMax.value = state.autoRange ? formatValue(range[1]) : state.valueMax;
    elements.valueMin.disabled = state.autoRange; elements.valueMax.disabled = state.autoRange;
    elements.lineWidth.disabled = !state.borders;
    elements.outlineWidth.disabled = !state.outline;
    elements.background.disabled = state.transparent;
    elements.paletteField.hidden = state.layer !== "anatomy";
    elements.gridControls.hidden = state.mode !== "grid";
    elements.gridSummary.textContent = `${state.rows} 行 × ${state.columns} 列 · 共 ${state.selected.length} 片`;
    elements.gridMode.setAttribute("aria-selected", String(state.mode === "grid"));
    elements.singleMode.setAttribute("aria-selected", String(state.mode === "single"));
    elements.orthoMode.setAttribute("aria-selected",String(state.mode==='ortho'));
    elements.meshMode.setAttribute('aria-selected',String(state.mode==='3d'));
    elements.meshControls.hidden=state.mode!=='3d';elements.meshPanel.hidden=state.mode!=='3d';elements.figure.hidden=state.mode==='3d';
    elements.exportSVG.disabled=state.mode==='3d';elements.exportSVG.title=state.mode==='3d'?'3D 为光栅渲染，请导出 PNG / PDF / TIFF；二维模式支持 SVG':'';
    elements.shellOpacity.value=state.shellOpacity;elements.shellOpacityValue.textContent=state.shellOpacity+'%';elements.coordinateMode.value=state.coordinateMode;
    valueTools.syncMapPreview(elements.customMap,state.colorbar);
    elements.smoothing3d.value=state.smoothing3d;elements.smoothing3dValue.textContent=window.AtlasMeshViewer.smoothingLabel(state.smoothing3d);
    elements.smoothing3d.setAttribute('aria-valuetext',window.AtlasMeshViewer.smoothingLabel(state.smoothing3d));
    elements.planeChoices.hidden=!state.show3dPlanes;
    for(const [id,orientation]of [['planeAP','coronal'],['planeML','sagittal'],['planeDV','horizontal']])elements[id].checked=state.planeVisibility[orientation];
    elements.crosshairControls.hidden=!linked();
    elements.cursorStatus.hidden=!linked();
    for(const [id,axis,orientation]of [['cursorAP','ap','coronal'],['cursorML','ml','sagittal'],['cursorDV','dv','horizontal']]){
      elements[id].value=state.crosshair[axis];elements[id].min=data.planes[orientation].slices[0].position;elements[id].max=data.planes[orientation].slices.at(-1).position;
    }
    elements.showCrosshair.checked=state.showCrosshair;
    elements.showCrosshair.closest('label').hidden=state.mode==='3d';
    elements.cursorStatus.textContent=`共享光标 · CCF AP ${state.crosshair.ap.toFixed(1)} / ML ${state.crosshair.ml.toFixed(3)} / CCF DV ${state.crosshair.dv.toFixed(1)} mm · 非 bregma`;
    elements.sliceRange.max = currentPlane().slices.length - 1;
    elements.sliceRange.value = linked()?utils.closestSlice(currentPlane().slices,currentRecord().position):state.selected[state.active];
    elements.sliceMin.textContent = positionString(currentPlane().slices[0].position) + " mm";
    elements.sliceMax.textContent = positionString(currentPlane().slices.at(-1).position) + " mm";
    elements.positionInput.min = currentPlane().slices[0].position;
    elements.positionInput.max = currentPlane().slices.at(-1).position;
    elements.positionInput.value = positionString(currentRecord().position);
    elements.positionLabel.textContent = currentPlane().axis + " 坐标 (mm)";
    elements.coordinateDisplay.textContent = coordinate(currentRecord());
    elements.previousSlice.disabled = Number(elements.sliceRange.value) === 0;
    elements.nextSlice.disabled = Number(elements.sliceRange.value) === currentPlane().slices.length - 1;
    elements.viewTitle.textContent = state.mode==='3d'?'3D 脑区':state.mode==='ortho'?'三视图联动':currentPlane().title;
    elements.datasetCount.textContent = state.mode==='3d'?'真实表面网格 · 100 μm 抽样':`${currentPlane().slices.length} 个片层 · ${state.mode === "grid" ? `${state.rows} 行 × ${state.columns} 列 · ${state.selected.length} 片` : state.mode==='ortho'?'共享 CCF 坐标':'单片视图'}`;
    elements.zoomValue.textContent = state.zoom + "%";
    elements.paper.style.width = state.zoom + "%";
    elements.paper.classList.toggle("checker", state.transparent);
    elements.paper.style.backgroundColor = state.transparent ? "#ffffff" : state.background;
    elements.sliceChips.hidden = state.mode !== "grid";
    elements.sliceChips.replaceChildren(...state.selected.map((sliceIndex, panelIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${panelIndex + 1} · ${positionString(currentPlane().slices[sliceIndex].position)}`;
      button.title = `第 ${panelIndex + 1} 个面板 · ${coordinate(currentPlane().slices[sliceIndex])}`;
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(panelIndex === state.active));
      button.addEventListener("click", () => change(() => { state.active = panelIndex; }));
      return button;
    }));
    const notes = {coronal: "CCF AP：距体积前缘的距离", sagittal: "ML：NIfTI 左右坐标；未换算为 bregma", horizontal: "CCF DV：距体积背侧边缘的距离"};
    elements.coordinateNote.textContent = notes[state.orientation];
    elements.selectionOnly.checked = state.selectionOnly;
    for(const key of ['valueKind','valueUnit','statFilter','statThreshold','absoluteThreshold'])elements[key].value=state[key];
    elements.symmetricRange.checked=state.symmetricRange;
    elements.statThreshold.disabled=!['p','q'].includes(state.statFilter);
    elements.absoluteThreshold.disabled=state.statFilter!=='value';
    for(const key of ['projectName','projectSource','projectNotes'])if(document.activeElement!==elements[key])elements[key].value=state[key];
    elements.projectSummary.textContent=`图谱 ${data.atlasId} · ${importHistory.length} 次 CSV 导入 · 项目含全部赋值、统计量、选区和设置；图谱已内置在配套 HTML 中。`;
    syncTree();
    syncValueEditor();
    colorbarEditor?.sync();
  }
  function selectedRegion(region) {
    return !state.selectedStructures.length || [region.structureId,...region.ancestors].some(id=>state.selectedStructures.includes(id));
  }
  function assignmentMap() {return state.assignmentTarget === "tree" ? state.structureValues : state.assignmentTarget === "family" ? state.familyValues : state.values;}
  function syncTree() {
    const query=treeQuery.toLowerCase().trim();
    if(treeKey!==query){
      treeKey=query;
      const matches=new Set(data.ontology.filter(node=>[node.id,node.acronym,node.name].some(value=>String(value).toLowerCase().includes(query))).flatMap(node=>[node.id,...node.ancestors]));
      function build(node,depth=0){
        if(query&&!matches.has(node.id))return null;
        const children=ontologyChildren.get(node.id)||[], available=renderableIds.has(node.id);
        const wrapper=document.createElement(children.length?'details':'div');wrapper.className='tree-node';
        if(children.length)wrapper.open=Boolean(query)||depth<2;
        const row=document.createElement(children.length?'summary':'div');row.className='tree-row';
        const check=document.createElement('input');check.type='checkbox';check.dataset.structureId=node.id;check.disabled=!available;
        check.setAttribute('aria-label',`选择 ${node.acronym} 及后代`);
        check.addEventListener('click',event=>event.stopPropagation());
        check.addEventListener('change',()=>change(()=>{state.selectedStructures=check.checked?[...state.selectedStructures,node.id]:state.selectedStructures.filter(id=>id!==node.id);}));
        const button=document.createElement('button');button.type='button';button.className='tree-name';button.textContent=node.acronym;
        button.title=`${node.id} · ${node.name}`;button.disabled=!available;
        button.setAttribute('aria-label',`赋值节点 ${node.acronym}`);
        button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();regionQuery=node.acronym;elements.regionSearch.value=regionQuery;change(()=>{state.assignmentTarget='tree';});elements.valueTable.scrollIntoView({block:'nearest'});});
        const info=document.createElement('span');info.textContent=available?String(node.id):'无独立轮廓';info.title=node.name;
        row.append(check,button,info);wrapper.append(row);
        if(children.length){const branch=document.createElement('div');branch.className='tree-children';for(const child of children){const element=build(child,depth+1);if(element)branch.append(element);}wrapper.append(branch);}
        return wrapper;
      }
      elements.structureTree.replaceChildren(...(ontologyChildren.get(null)||[]).map(node=>build(node)).filter(Boolean));
    }
    for(const check of elements.structureTree.querySelectorAll('[data-structure-id]'))check.checked=state.selectedStructures.includes(Number(check.dataset.structureId));
    const count=data.regions.filter(selectedRegion).length;
    elements.selectionCount.textContent=state.selectedStructures.length?`${state.selectedStructures.length} 个层级选区 · 覆盖 ${count} 个聚合结构`:'未选择 · 显示全部结构';
  }
  function editorEntries() {
    if (state.assignmentTarget === "tree") return data.ontology.filter(node=>renderableIds.has(node.id)).map(node=>({...node,id:String(node.id),structureId:node.id,family:"",label:node.acronym}));
    if (state.assignmentTarget === "family") return familyKeys.map(key => {
      const region = data.regions.find(item => item.family === key);
      return {id: key, name: region.familyName || key, family: key};
    });
    return data.regions;
  }
  function syncValueEditor() {
    const query = regionQuery.toLowerCase().trim();
    const key = state.assignmentTarget + "|" + state.assignmentHemisphere + "|" + query;
    const entries = editorEntries();
    const filtered = entries.filter(entry => [entry.id, entry.label, entry.name, entry.family].some(value => String(value || "").toLowerCase().includes(query)));
    if (key !== editorKey || !elements.valueTable.childElementCount) {
      editorKey = key;
      elements.valueTable.replaceChildren(...filtered.map(entry => {
        const row = document.createElement("div"); row.className = "value-row"; row.dataset.key = entry.id;
        const swatch = document.createElement("span"); swatch.className = "value-swatch";
        const name = document.createElement("div"); name.className = "value-name"; name.title = `${entry.id} · ${entry.name || entry.id}`;
        const acronym = document.createElement("strong"); acronym.textContent = entry.label || entry.id;
        const full = document.createElement("span"); full.textContent = entry.name || entry.family || entry.id;
        name.append(acronym, full);
        const input = document.createElement("input"); input.type = "number"; input.step = "any";
        input.setAttribute("aria-label", `${entry.id} 数值`);
        input.addEventListener("change", () => {
          if (input.value !== "" && !Number.isFinite(Number(input.value))) return;
          change(() => {
            const mapping = assignmentMap();
            const identifier = pro.key(entry.id, state.assignmentHemisphere);
            if (input.value === "") delete mapping[identifier]; else mapping[identifier] = Number(input.value);
            delete state.statistics[`${state.assignmentTarget}:${identifier}`];
            state.layer = "custom";
          });
        });
        row.append(swatch, name, input); return row;
      }));
      if (!filtered.length) {
        const empty = document.createElement("div"); empty.className = "value-empty"; empty.textContent = "没有匹配的分区"; elements.valueTable.append(empty);
      }
    }
    const range = customRange(), mapping = assignmentMap();
    for (const row of elements.valueTable.querySelectorAll("[data-key]")) {
      const input = row.querySelector("input");
      const identifier = pro.key(row.dataset.key, state.assignmentHemisphere);
      const region = state.assignmentTarget === "tree" ? editorEntries().find(item=>item.id===row.dataset.key) : data.regions.find(item => item.id === row.dataset.key);
      const value = state.assignmentTarget === "family" ? mapping[identifier] ?? mapping[row.dataset.key] : pro.resolve(region, state.assignmentHemisphere, state).value;
      if (document.activeElement !== input) input.value = Object.hasOwn(mapping, identifier) ? mapping[identifier] : "";
      input.placeholder = Number.isFinite(value) && !Object.hasOwn(mapping, identifier) ? "继承 " + formatValue(value) : "NA";
      row.querySelector(".value-swatch").style.backgroundColor = valueTools.valueColour(value, ...range, state.customMap, state.missingColour,state.colorbar);
    }
    const covered = data.regions.filter(region => ["L","R"].some(hemi => Number.isFinite(pro.resolve(region, hemi, state).value))).length;
    elements.assignedCount.textContent = `${filtered.length} / ${entries.length} 项 · 已覆盖 ${covered} 个脑区`;
  }
  function inspect(regionIndex = null, hemisphere = "B",orientation=state.orientation,position=currentRecord().position) {
    elements.regionFamily.previousElementSibling.textContent='Allen 分组';
    if (regionIndex === null) {
      elements.regionName.textContent = "—";
      elements.regionFamily.textContent = "—";
      elements.regionValueLabel.textContent = state.mode==='3d'?'3D 可见半球网格':'当前片层脑区数';
      elements.regionValue.textContent = state.mode==='3d'?meshViewer?.summary().visibleMeshes||0:currentRecord().count;
      return;
    }
    const region = data.regions[regionIndex], network = currentNetwork();
    elements.regionName.textContent = `${region.id} · ${hemisphere} · ${region.name || region.id}`;
    elements.regionName.title = elements.regionName.textContent;
    elements.regionFamily.textContent = region.family || "—";
    elements.regionFamily.title = region.familyName || region.family || "";
    const mf=research?.merfishSummary();if(mf?.regional){const row=research.merfishEntry(region.id,hemisphere,orientation,position);elements.regionValueLabel.textContent=mf.regional.title;elements.regionValue.textContent=formatValue(row?.value)+' '+mf.regional.unit+' · n='+(row?.n??0);elements.regionValue.title=`${row?.status||'no_coverage'} · selected=${row?.selected_count??0} · eligible=${row?.eligible_cells??0}`;return;}
    if (state.layer === "custom") {
      elements.regionValueLabel.textContent = state.valueTitle || "赋值";
      const record=pro.resolve(region,hemisphere,state);
      elements.regionValue.textContent = formatValue(record.value)+(state.valueUnit?' '+state.valueUnit:'')+['p','q','n'].filter(field=>Number.isFinite(record.statistics[field])).map(field=>` · ${field}=${formatValue(record.statistics[field])}`).join('');
      elements.regionValue.title=elements.regionValue.textContent+` · 赋值来源 ${record.target||'NA'} / ${record.hemisphere||'—'}`;
      return;
    }
    elements.regionValueLabel.textContent = network ? "网络覆盖比例" : "Allen 结构颜色";
    const value = network?.values[regionIndex];
    elements.regionValue.textContent = network ? (value === null ? "NA" : (value * 100).toFixed(2) + "%") : region.colour;
  }
  async function decode(record,orientation=state.orientation) {
    const key = orientation + ":" + record.index;
    if (!decoded.has(key)) decoded.set(key, (async () => {
      const binary = atob(record.packed);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
      return JSON.parse(await new Response(stream).text());
    })().catch(exception => { decoded.delete(key); throw exception; }));
    return decoded.get(key);
  }
  function svgElement(tag, attributes = {}, text = null) {
    const element = document.createElementNS(namespace, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    if (text !== null) element.textContent = text;
    return element;
  }
  function colour(regionIndex, range = customRange(), hemisphere = "B",orientation,position) {
    const merfishColour=research?.merfishColour(data.regions[regionIndex].id,hemisphere,orientation,position);if(merfishColour!==undefined)return merfishColour;
    if (state.layer === "custom") {
      const record=pro.resolve(data.regions[regionIndex],hemisphere,state);
      if(Number.isFinite(record.value)&&!pro.passes(record,state))return '#f6f6f6';
      return valueTools.valueColour(record.value, ...range, state.customMap, state.missingColour,state.colorbar);
    }
    const network = currentNetwork();
    if (network) return colorbars.colour(network.values[regionIndex],colourSpec(),state.colorbar);
    const region = data.regions[regionIndex];
    if (state.palette === "family") return region.familyColour;
    if (state.palette === "gray") return utils.grayColour(region.colour);
    return region.colour;
  }
  function hemispherePayload(payload, orientation, record) {
    const sides = orientation === "sagittal" ? [record.position < 0 ? "L" : "R"] : ["L", "R"];
    const regions = [];
    for (const item of payload.regions) for (const hemisphere of sides) {
      if (state.selectionOnly && !selectedRegion(data.regions[item[0]])) continue;
      if (state.hemisphere !== "B" && state.hemisphere !== hemisphere) continue;
      let anchor = item[2];
      if (orientation !== "sagittal") {
        const cacheKey = `${orientation}:${record.index}:${item[0]}:${hemisphere}`;
        if (!anchorCache.has(cacheKey)) {
          const path = new Path2D(item[1]);
          const left = hemisphere === "L" ? 0 : 570, right = hemisphere === "L" ? 570 : 1140;
          const inside = (x, y) => x > left && x < right && textMeasure.isPointInPath(path, x, y, "evenodd");
          let point = anchor && inside(...anchor) ? anchor : null;
          if (!point && anchor && inside(1140-anchor[0], anchor[1])) point = [1140-anchor[0], anchor[1]];
          const plane = data.planes[orientation];
          if (!point) for (let y = 5; y < plane.height && !point; y += 10) for (let x = left+5; x < right && !point; x += 10) if (inside(x,y)) point = [x,y];
          anchorCache.set(cacheKey, point);
        }
        anchor = anchorCache.get(cacheKey);
      }
      regions.push([item[0], item[1], anchor, item[3], hemisphere]);
    }
    return {...payload, regions};
  }
  function addRegionNames(group, payload, layout, range) {
    if (!state.showRegionNames) return 0;
    const fontSize = state.regionNameSize * layout.points;
    textMeasure.font = `500 ${fontSize}px Arial`;
    const occupied = [];
    const maximum = state.regionNameDensity === "dense" ? (state.mode === "single" ? 160 : 48) : (state.mode === "single" ? 30 : 12);
    const candidates = payload.regions.filter(item => Array.isArray(item[2]) && Number.isFinite(item[3])).sort((first, second) => {
      if (state.layer === "custom") {
        const assigned = Number(Number.isFinite(customValue(second[0], second[4]))) - Number(Number.isFinite(customValue(first[0], first[4])));
        if (assigned) return assigned;
      }
      return second[3] - first[3];
    });
    for (const [regionIndex, , anchor, , hemisphere] of candidates) {
      if (occupied.length >= maximum) break;
      const region = data.regions[regionIndex];
      const label = state.regionNameFormat === "full" ? region.name || region.id : region.id;
      const [x,y] = layout.project?layout.project(anchor):[layout.offsetX+anchor[0]*layout.scale,layout.originY+anchor[1]*layout.scale];
      const width = textMeasure.measureText(label).width;
      const box = {left: x - width / 2 - 2, right: x + width / 2 + 2,
        top: y - fontSize * .55 - 2, bottom: y + fontSize * .55 + 2};
      if (box.left < layout.left || box.right > layout.right || box.top < layout.originY || box.bottom > layout.bottom) continue;
      if (occupied.some(other => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue;
      occupied.push(box);
      const darkFill = Number.parseInt(utils.grayColour(colour(regionIndex, range, hemisphere,layout.orientation,layout.position)).slice(1, 3), 16) < 140;
      const text = svgElement("text", {x, y, "text-anchor": "middle", "dominant-baseline": "central",
        "font-size": fontSize, "font-weight": 500, fill: darkFill ? "#ffffff" : "#253c30",
        stroke: darkFill ? "#244333" : "#ffffff", "stroke-width": .6,
        "stroke-opacity": .7, "paint-order": "stroke", class: "roi-label", "data-roi-label": region.id,'data-label-region':regionIndex,'data-label-hemisphere':hemisphere}, label);
      text.append(svgElement("title", {}, `${region.id} · ${region.name || region.id}`));
      group.append(text);
    }
    return occupied.length;
  }
  function buildFigure(payloads, records, panelIndices, orientations=records.map(()=>state.orientation)) {
    const ortho=state.mode==='ortho',signalOnly=!!research?.aavSignalOnly();
    const plane = ortho?{width:1320,height:1320,title:'三视图联动',axis:'AP / ML / DV'}:currentPlane(), width = 1200, margin = state.publicationStyle?24:40;
    const points = width / (state.paperWidth / 25.4 * 72);
    const gapX=state.mode==='grid'?state.panelGapX:24,gapY=state.mode==='grid'?state.panelGapY:24;
    const columns = state.mode === "single" ? 1 : ortho?3:state.columns;
    const rows = Math.ceil(records.length / columns);
    const cellWidth = (width - margin * 2 - gapX * (columns - 1)) / columns;
    const scale = Math.min((cellWidth - 12) / plane.width, state.mode === "single" ? 0.78 : 10);
    const labelHeight = state.publicationStyle?(state.showLabels?7*points*1.7:0):31, bodyHeight = plane.height * scale;
    const rowHeight = bodyHeight + labelHeight + 12;
    const top = state.publicationStyle?8*points*2:84, footer = state.publicationStyle?7*points*4:(state.layer==='custom'&&state.statFilter!=='none'?96:72)+(state.sliceDepth?24:0);
    const height = top + rowHeight * rows + gapY * (rows - 1) + footer;
    const range = customRange();
    let nameCount = 0;
    let referenceScale=scale,tiltedSlice=false;
    const root = svgElement("svg", {viewBox: `0 0 ${width} ${height}`, width, height,
      role: "img", "aria-label": `${plane.title}脑图谱`, "font-family": "Arial, Microsoft YaHei, sans-serif",class:state.sliceDepth?'slice-depth-enabled':''});
    if(state.publicationStyle)root.setAttribute('data-publication-style','true');
    root.append(svgElement("title", {}, "Allen CCF mouse brain atlas"));
    root.append(svgElement("metadata", {}, JSON.stringify({source: data.source, voxelMm: 0.01,
      browseStepMm: 0.1, coordinate: plane.axis, positions: records.map(record => record.position), layout: {rows, columns}, layer: state.layer,
      panelSpacing:{horizontal:gapX,vertical:gapY,units:'1/1200 figure width',horizontalMm:gapX*state.paperWidth/1200,verticalMm:gapY*state.paperWidth/1200},
      customColourMap: state.layer === "custom" ? state.customMap : null,
      customRange: state.layer === "custom" ? range : null,hemisphere:state.hemisphere,orientations,crosshair:ortho?state.crosshair:null,
      colourMapping:colourSpec(),colorbar:state.colorbar,
      sliceDisplay:{...sliceDepth.clean(state),projection:'orthographic display only',thicknessUnit:'illustrative display units, not physical tissue thickness',frontColourLighting:false},
      statistics:state.layer==='custom'?{kind:state.valueKind,unit:state.valueUnit,filter:state.statFilter,threshold:state.statFilter==='value'?state.absoluteThreshold:state.statThreshold}:null,
      project:{name:state.projectName,source:state.projectSource,atlasId:data.atlasId,fingerprint:data.fingerprint}})));
    if (!state.transparent) root.append(svgElement("rect", {width, height, fill: state.background,'data-canvas-background':'true'}));
    const english = {coronal: "coronal", sagittal: "sagittal", horizontal: "horizontal"}[state.orientation];
    const mfTitle=research?.merfishSummary(),publicationTitle=mfTitle?.enabled&&mfTitle.loaded?(mfTitle.settings.mode==='gene'?mfTitle.gene?.symbol:mfTitle.settings.cellType||'Cell types')+(mfTitle.regional?' · '+mfTitle.regional.title:''):state.layer==='custom'?state.valueTitle:'Allen CCF';
    root.append(svgElement("text", {x: margin, y: state.publicationStyle?8*points:35, fill: state.publicationStyle?'#222222':"#253732", "font-size": (state.publicationStyle?8:9) * points, "font-weight": 700},state.publicationStyle?publicationTitle:ortho?'Allen CCF linked orthogonal views':`Allen CCF ${english} atlas`));
    if(!state.publicationStyle)root.append(svgElement("text", {x: margin, y: 59, fill: "#68786e", "font-size": 6.5 * points},
      `${records.length} section${records.length === 1 ? "" : "s"} | 10-um native boundaries | ${state.layer === "anatomy" ? "Allen anatomy" : state.layer === "custom" ? state.valueTitle || "Assigned value" : currentNetwork().title}`));
    payloads.forEach((originalPayload, index) => {
      const orientation=orientations[index],panelPlane=data.planes[orientation];
      const payload = hemispherePayload(originalPayload, orientation, records[index]);
      const column = index % columns, row = Math.floor(index / columns);
      const originX = margin + column * (cellWidth + gapX), originY = top + row * (rowHeight + gapY);
      const group = svgElement("g", {"data-panel": panelIndices[index],"data-orientation":orientation});
      group.append(svgElement("rect", {x: originX, y: originY, width: cellWidth, height: rowHeight,
        fill: "transparent", class: "panel-hit", "data-ui": "hit-area"}));
      if (state.showLabels) {
        const label = coordinate(records[index],true,orientation);
        const labelSize = Math.min((state.publicationStyle?7:6.5) * points, (cellWidth - 10) / (label.length * 0.54));
        group.append(svgElement("text", {x: originX + cellWidth / 2, y: originY + (state.publicationStyle?7*points:17),
          "text-anchor": "middle", "font-size": labelSize, "font-weight": 700,
          fill: state.publicationStyle?'#222222':panelIndices[index] === state.active ? "#176c68" : "#3f5148"}, label));
      }
      const offsetX = originX + (cellWidth - panelPlane.width * scale) / 2;
      const imageY=originY+labelHeight+(bodyHeight-panelPlane.height*scale)/2;
      const projection=sliceDepth.projection({width:panelPlane.width,height:panelPlane.height,scale,x:offsetX,y:imageY,mode:state.mode,state:signalOnly?{...state,sliceDepth:false}:state});
      referenceScale=projection.scale;tiltedSlice=projection.tilted;
      const shapes = svgElement("g", {transform:sliceDepth.matrixText(projection.matrix),class:'anatomy-space','data-position':records[index].position,'data-display-tilted':projection.tilted,'data-front-unlit':'true'});
      const defs = svgElement("defs");
      for (const hemi of ["L", "R"]) {
        const clip = svgElement("clipPath", {id: `hemi-${index}-${hemi}`});
        clip.append(svgElement("rect", {x: hemi === "L" ? 0 : 570, y: 0, width: 570, height: panelPlane.height})); defs.append(clip);
      }
      shapes.append(defs);
      if(!signalOnly)for (const [regionIndex, path, , , hemisphere] of payload.regions) {
        const shape = svgElement("path", {
          d: path, fill: colour(regionIndex, range, hemisphere,orientation,records[index].position), "fill-opacity": state.fillOpacity / 100 * (selectedRegion(data.regions[regionIndex]) ? 1 : .18),
          stroke: state.borders ? state.lineColour : "none",
          "stroke-width": state.lineWidth * points / scale,
          "stroke-linejoin": "round", "fill-rule": "evenodd", class: "roi", "data-region": regionIndex, "data-hemisphere": hemisphere,
          "data-pass": state.layer!=='custom'||pro.passes(pro.resolve(data.regions[regionIndex],hemisphere,state),state),
          "data-value":state.layer==='custom'?(customValue(regionIndex,hemisphere)??''):(currentNetwork()?.values[regionIndex]??''),
          ...(orientation !== "sagittal" ? {"clip-path": `url(#hemi-${index}-${hemisphere})`} : {})
        });
        const region = data.regions[regionIndex];
        shape.append(svgElement("title", {}, `${region.id} · ${hemisphere} · ${region.name || region.id}${state.layer === "custom" ? " · " + formatValue(customValue(regionIndex, hemisphere)) : ""}`));
        shapes.append(shape);
      }
      if (!signalOnly && state.outline && payload.outline && payload.regions.length) shapes.append(svgElement("path", {d: payload.outline,
        fill: "none", stroke: state.lineColour, "stroke-width": state.outlineWidth * points / scale,
        "stroke-linejoin": "round", "pointer-events": "none", "fill-rule": "evenodd", "data-outline": "true",
        ...(state.hemisphere !== "B" && orientation !== "sagittal" ? {"clip-path": `url(#hemi-${index}-${state.hemisphere})`} : {})}));
      if(!signalOnly&&ortho&&state.showCrosshair){
        const [x,y]=pro.pointToPlane(orientation,state.crosshair);
        shapes.append(svgElement('path',{d:`M${x},0V${panelPlane.height}M0,${y}H${panelPlane.width}`,fill:'none',stroke:'#6546b0','stroke-width':.55*points/scale,'stroke-dasharray':`${3*points/scale} ${2*points/scale}`,'pointer-events':'none',class:'crosshair'}));
      }
      if(!signalOnly)sliceDepth.decorate(group,{projection,payload,index,orientation,hemisphere:state.hemisphere,selectionOnly:state.selectionOnly,box:{x:originX,y:originY+labelHeight,width:cellWidth,height:bodyHeight}});
      group.append(shapes);
      research?.append2D(shapes,{orientation,position:records[index].position,plane:panelPlane,payload,scale,points});
      if(!signalOnly)nameCount += addRegionNames(group, payload, {points, scale, offsetX,orientation,position:records[index].position,
        originY: imageY, left: originX, right: originX + cellWidth,
        bottom: imageY + panelPlane.height*scale,project:projection.map}, range);
      if (!signalOnly&&!payload.regions.length) group.append(svgElement("text", {x: originX + cellWidth / 2,
        y: originY + labelHeight + bodyHeight / 2, "text-anchor": "middle", fill: "#8b9990", "font-size": 6.5 * points}, "无已标注脑区"));
      root.append(group);
    });
    const footerY = height - footer + 10;
    if (state.showScale&&!tiltedSlice) {
      const scaleLength = 100 * referenceScale;
      root.append(svgElement("line", {x1: margin, x2: margin + scaleLength, y1: footerY + 22, y2: footerY + 22,
        stroke: "#334b3d", "stroke-width": 0.65 * points, "data-scale-mm": 1}));
      root.append(svgElement("text", {x: margin + scaleLength / 2, y: footerY + 8,
        "text-anchor": "middle", fill: "#526859", "font-size": (state.publicationStyle?7:6.2) * points}, "1 mm"));
    }
    if(state.layer==='custom'&&state.statFilter!=='none'){
      const description=state.statFilter==='value'?`|value| >= ${state.absoluteThreshold}`:`${state.statFilter} <= ${state.statThreshold} (imported; missing ${state.statFilter} excluded)`;
      root.append(svgElement('text',{x:margin,y:height-(state.sliceDepth?54:35),fill:'#65796b','font-size':5.5*points,'data-stat-filter':state.statFilter},description));
    }
    if(!signalOnly&&state.sliceDepth)root.append(svgElement('text',{x:margin,y:height-30,fill:'#7e8d80','font-size':5.2*points,'data-slice-display-note':'true'},tiltedSlice?'2.5D illustrative slab | Display thickness only; not physical section thickness | Tilted view: scale bar hidden':'2.5D display relief | Display thickness only; not physical section thickness | Front colours unchanged'));
    if(state.showLabels)root.append(svgElement("text", {x: margin, y: height - 12, fill: "#7e8d80", "font-size": (state.publicationStyle?6.5:5.7) * points,'data-coordinate-note':'true'},
      state.publicationStyle?'Allen CCF native space (not bregma)':ortho ? "AP / DV: CCF volume-edge distances; ML: NIfTI RAS x. Not bregma. Linked at 0.1-mm browse intervals." : state.orientation === "sagittal" ? "ML: NIfTI coordinate. Native annotation; no geometric smoothing." :
        `CCF ${plane.axis}: distance from volume ${plane.axis === "AP" ? "anterior" : "dorsal"} edge. Coordinates are not bregma.`));
    root.addEventListener("pointerover", event => {
      const target = event.target.closest("[data-region]");
      if (target) inspect(Number(target.dataset.region), target.dataset.hemisphere,target.closest('[data-orientation]')?.dataset.orientation,Number(target.closest('.anatomy-space')?.dataset.position));
    });
    root.dataset.labelCount = nameCount;
    const minFont=Math.min(...[...root.querySelectorAll('text')].map(n=>Number(n.getAttribute('font-size'))/points).filter(Number.isFinite));elements.publicationCheck.textContent=state.publicationStyle?`出版预检：${state.paperWidth} mm，${state.dpi} dpi；正文最小字号 ${minFont.toFixed(1)} pt。${minFont<6?'当前排版文字小于 6 pt，请减少列数或增大宽度。':'字号检查通过；请再核对图例与目标期刊要求。'}`:'';
    root.addEventListener("pointerleave", () => inspect());
    root.addEventListener("click", event => {
      const panel = event.target.closest("[data-panel]");
      if(panel&&ortho){
        const shapes=panel.querySelector('.anatomy-space'),orientation=panel.dataset.orientation;
        const point=root.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
        const native=point.matrixTransform(shapes.getScreenCTM().inverse()),bounds=data.planes[orientation];
        if(native.x>=0&&native.x<=bounds.width&&native.y>=0&&native.y<=bounds.height)change(()=>{state.orientation=orientation;state.crosshair=pro.pointFromPlane(orientation,native.x,native.y,Number(shapes.dataset.position));});
        return;
      }
      if (panel && state.active !== Number(panel.dataset.panel)) change(() => { state.active = Number(panel.dataset.panel); });
    });
    return research?.decorateMerfish(colorbars.dock(root,colourSpec(),state.colorbar,state.paperWidth))||colorbars.dock(root,colourSpec(),state.colorbar,state.paperWidth);
  }
  function inspectConnectome(record){
    const fc=meshViewer?.connectomePlan;if(!fc?.enabled){inspect(record.regionIndex>=0?record.regionIndex:null,record.hemisphere||'B');return;}
    const current=record.connectomeType==='node'?fc.nodes.find(n=>n.id===record.id):fc.edges.find(e=>e.source===record.source&&e.target===record.target||!fc.settings.directed&&e.source===record.target&&e.target===record.source);if(!current){inspect(null);return;}record={...current,connectomeType:record.connectomeType};
    elements.regionFamily.previousElementSibling.textContent='功能连接';if(record.connectomeType==='edge'){elements.regionName.textContent=record.source+(fc.settings.directed?' → ':' — ')+record.target;elements.regionFamily.textContent=record.weight>=0?'正连接':'负连接';elements.regionValueLabel.textContent=fc.settings.metric;elements.regionValue.textContent=Number(record.weight.toPrecision(6)).toString();}else{elements.regionName.textContent=record.label||record.id;elements.regionFamily.textContent=record.positionSource;elements.regionValueLabel.textContent='当前网络度 / 绝对强度';elements.regionValue.textContent=`${record.degree} / ${Number(record.strength.toPrecision(5))}`;}
  }
  function threeDColourSpec(){const fc=research?.connectomeSummary(),mf=research?.merfishSummary();return mf?.regional||meshViewer?.implantPlan?.enabled&&meshViewer.implantPlan.glass||fc?.enabled&&fc.settings.brain!=='surfaces'||mf?.enabled&&mf.loaded&&mf.settings.brain!=='current'?null:colourSpec();}
  function ensureMeshViewer(){
    if(!meshPromise)meshPromise=window.AtlasMeshViewer.create(elements.meshStage,{
        onHover:record=>{const inspected=record||meshPicked;if(inspected?.connectomeType)inspectConnectome(inspected);else inspect(inspected?.regionIndex??null,inspected?.hemisphere||'B');},
        onCamera:pose=>change(()=>{state.camera3d=pose;},false),
        onPick:(record,point)=>{
          meshPicked=record;
          if(record.connectomeType){if(record.connectomeType==='node')change(()=>{state.crosshair={ap:record.ap,ml:record.ml,dv:record.dv};});inspectConnectome(record);return;}
          const region=data.regions[record.regionIndex];
          change(()=>{state.crosshair=point;if(region.structureId!==null)state.selectedStructures=state.selectedStructures.includes(region.structureId)?[]:[region.structureId];});
          inspect(record.regionIndex,record.hemisphere);
        }
      }).then(viewer=>(meshViewer=viewer)).catch(exception=>{meshPromise=null;throw exception;});
    return meshPromise;
  }
  function merfishView(){if(state.mode==='3d')return{volume:true,hemisphere:state.hemisphere,planes:[]};if(state.mode==='ortho')return{volume:false,hemisphere:state.hemisphere,planes:['coronal','sagittal','horizontal'].map(orientation=>({orientation,position:data.planes[orientation].slices[utils.closestSlice(data.planes[orientation].slices,state.crosshair[coordinateAxis(orientation)])].position}))};const indices=state.mode==='single'?[state.active]:state.selected.map((_,i)=>i);return{volume:false,hemisphere:state.hemisphere,planes:indices.map(i=>({orientation:state.orientation,position:currentPlane().slices[state.selected[i]].position}))};}
  function requestRender() {
    const token = ++generation;
    const preparation=Promise.resolve(research?.prepareView(merfishView()));
    if(state.mode==='3d'){
      elements.loading.hidden=false;elements.figure.setAttribute('aria-busy','true');
      readyPromise=Promise.all([ensureMeshViewer(),preparation]).then(([viewer])=>{
        if(token!==generation)return;viewer.setActive(true);
        const range=customRange();
        let count=viewer.update({state,colour:(index,hemi)=>colour(index,range,hemi),selected:index=>selectedRegion(data.regions[index]),assigned:(index,hemi)=>state.layer==='custom'?pro.passes(pro.resolve(data.regions[index],hemi,state),state):(currentNetwork()?.values[index]??0)>0});
        if(research)viewer.setResearch({...research.scene3D(),hemisphere:state.hemisphere});
        count=viewer.objects.filter(mesh=>mesh.visible).length;
        elements.meshNote.textContent=`356 / 357 个聚合结构 · 100 μm 抽样 · 平滑 ${state.smoothing3d}/200${state.smoothing3d===0?'（关闭）':''} · c 区未保留 · 非定量分割`;
        elements.meshStatus.textContent=`${count} 个可见半球网格 · ${viewer.bundle.triangles.toLocaleString()} 个三角面 · 点击脑区查询/选中；查看选点三视图可定位`;
        elements.meshLegend.replaceChildren();
        const note=document.createElement('span');note.textContent=state.layer==='anatomy'?'Allen 解剖色，经过三维光照；L/R 为解剖半球。':'仅显示有值且通过筛选的网格；色条对应材质底色，三维光照会影响明暗。';elements.meshLegend.append(note);
        const spec=threeDColourSpec(),fc=research?.connectomeSummary();elements.meshPanel.dataset.colorbarPosition=spec&&state.colorbar.show?state.colorbar.position:'bottom';
        if(fc?.enabled){const text=document.createElement('span');text.dataset.connectomeLegend='true';text.textContent=`功能连接 ${fc.metric} · ${fc.directed?'有向':'无向'} · ${fc.diagnostics.visibleNodes} 球 / ${fc.diagnostics.visibleEdges} 柱 · |w| ≥ ${fc.settings.threshold} · 球模式：${fc.settings.nodeSize} · 正连接 ${fc.settings.positiveColour} / 负连接 ${fc.settings.negativeColour}`;elements.meshLegend.replaceChildren(text);elements.meshStatus.textContent='球体/圆柱连接：显示节点坐标和导入权重；不是实测纤维轨迹。';}
        if(fc?.enabled){elements.meshLegend.firstChild.textContent+=` · 球倍率 ${fc.settings.nodeScale} / 柱倍率 ${fc.settings.edgeScale} · 柱模式 ${fc.settings.edgeSize==='fixed'?'固定':'按权重'}；单独指定直径的对象优先。`;}
        elements.meshPanel.querySelector('.mesh-heading strong').textContent=viewer.implantPlan?.enabled&&viewer.implantPlan.glass?'Allen CCF · 玻璃脑 / 解剖分区':'Allen CCF · 3D region surfaces';
        if(viewer.implantPlan?.enabled){const text=document.createElement('span'),m=viewer.implantPlan,p=m.parcellation;text.dataset.implantLegend='true';text.textContent=`${m.glass?'玻璃脑':'当前脑区背景'} · ${m.items.length} 个位点/电极 · Allen 分区${p.show?'全局不透明度 '+Math.round(p.opacity*100)+'%（单区设置优先）':'隐藏'} · CCF mm（非 bregma）`;if(!fc?.enabled)elements.meshLegend.replaceChildren(text);else elements.meshLegend.append(text);elements.meshNote.textContent=`${count} 个可见半球分区网格 · 脑壳与分区独立控制 · 可拖动旋转`;elements.meshStatus.textContent='入口—尖端定义电极位置；分区为 Allen 解剖色，柄宽与触点为示意。';}
        const mf=research?.merfishSummary();if(mf?.enabled&&mf.loaded){const text=document.createElement('span');text.dataset.merfishLegend='true';text.textContent=mf.regional?`MERFISH 解剖分区热图 · ${mf.regional.title} (${mf.regional.unit}) · 色阶 ${mf.range.join(' – ')} · 全量细胞聚合、左右分开，未覆盖/低 n 为灰色`:`MERFISH · ${mf.settings.mode==='gene'?mf.gene?.symbol+' 源 log2 值':mf.settings.level+' 分类色'} · 显示 ${mf.displayed.toLocaleString()} / 匹配 ${mf.matched.toLocaleString()} · 行间隔 ${mf.sampling.stride} · 真实 CCF 坐标`;elements.meshLegend.append(text);}
        if(spec&&state.colorbar.show){
          const legend=colorbars.svg(spec,state.colorbar,1,state.colorbar.orientation==='vertical'?Infinity:Math.max(5,state.paperWidth-30)),root=svgElement('svg',{viewBox:`0 0 ${legend.width} ${legend.height}`,width:legend.width*4,height:legend.height*4,'aria-label':'3D 数值色条'});root.append(legend.group);elements.meshLegend.append(root);
        }
        elements.loading.hidden=true;elements.figure.setAttribute('aria-busy','false');elements.errorBanner.hidden=true;elements.renderStatus.textContent=fc?.enabled?'3D 功能连接球柱图，不表示因果/实测纤维轨迹':'3D 显示网格，不用于体积测量';if(meshPicked?.connectomeType&&fc?.enabled)inspectConnectome(meshPicked);else inspect(meshPicked?.regionIndex>=0?meshPicked.regionIndex:null,meshPicked?.hemisphere||'B');
      }).catch(exception=>{if(token===generation)error('3D 载入失败：'+exception.message);});
      return readyPromise;
    }
    meshViewer?.setActive(false);
    const ortho=state.mode==='ortho';
    const panelIndices = state.mode === "single" ? [state.active] : ortho?[0,1,2]:state.selected.map((_, index) => index);
    const orientations=ortho?['coronal','sagittal','horizontal']:panelIndices.map(()=>state.orientation);
    const records = ortho?orientations.map(orientation=>data.planes[orientation].slices[utils.closestSlice(data.planes[orientation].slices,state.crosshair[coordinateAxis(orientation)])]):panelIndices.map(index => currentPlane().slices[state.selected[index]]);
    elements.loading.hidden = false;
    elements.figure.setAttribute("aria-busy", "true");
    readyPromise = Promise.all([Promise.all(records.map((record,index)=>decode(record,orientations[index]))),preparation]).then(([payloads]) => {
      if (token !== generation) return;
      currentSvg = buildFigure(payloads, records, panelIndices,orientations);
      elements.figure.replaceChildren(currentSvg);
      elements.loading.hidden = true;
      elements.figure.setAttribute("aria-busy", "false");
      elements.renderStatus.textContent = `${records.reduce((sum, record) => sum + record.count, 0)} 个脑区图形 · ${currentSvg.dataset.labelCount} 个标签`;
      elements.errorBanner.hidden = true;
      inspect();
    }).catch(exception => {
      if (token === generation) { error("片层渲染失败：" + exception.message); elements.renderStatus.textContent = "渲染失败"; }
    });
    return readyPromise;
  }
  function change(mutator, render = true) {
    mutator(); state = sanitise(state); persist(); sync();
    if (render) requestRender();
  }
  function step(direction) {
    setSlice(utils.clamp(Number(elements.sliceRange.value)+direction,0,currentPlane().slices.length-1));
  }
  function setSlice(index){change(()=>{if(linked())state.crosshair[coordinateAxis(state.orientation)]=currentPlane().slices[index].position;else state.selected[state.active]=index;});}
  function stopPlayback() {
    if (playback) clearInterval(playback);
    playback = null;
    elements.playSlices.innerHTML = '<i data-lucide="play"></i>';
    elements.playSlices.setAttribute("aria-label", "播放片层");
    elements.playSlices.title = "播放片层";
    icons();
  }
  function saveFile(blob, filename) {
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function filename(extension) {
    return `allen_${state.mode==='3d'?'3d':state.mode==='ortho'?'orthogonal':state.orientation}_${state.mode === "single" ? positionString(currentRecord().position) : linked()?'linked':`${state.rows}x${state.columns}_${state.selected.length}_sections`}_${state.layer}.${extension}`;
  }
  function svgForExport(pixelWidth = null) {
    if (!currentSvg) throw new Error("图谱尚未就绪");
    const clone = currentSvg.cloneNode(true);
    clone.querySelectorAll("[data-ui]").forEach(node => node.remove());
    const ratio = currentSvg.viewBox.baseVal.height / currentSvg.viewBox.baseVal.width;
    clone.setAttribute("width", pixelWidth === null ? state.paperWidth + "mm" : pixelWidth);
    clone.setAttribute("height", pixelWidth === null ? (state.paperWidth * ratio).toFixed(3) + "mm" : Math.round(pixelWidth * ratio));
    clone.removeAttribute("role"); clone.removeAttribute("aria-label");
    return new XMLSerializer().serializeToString(clone);
  }
  async function exportImage(format) {
    stopPlayback();
    for(const id of ['exportSVG','exportPNG','exportPDF','exportTIFF'])elements[id].disabled=true;
    elements.exportStatus.textContent = "正在导出…";
    try {
      await readyPromise;
      if(format==='pdf'||format==='tiff'){
        const snapshot=structuredClone(state),spec=snapshot.mode==='3d'?threeDColourSpec():colourSpec(),downloadName=filename(format==='tiff'?'tif':'pdf'),root=snapshot.mode==='3d'?colorbars.dock(await capture3DSource(meshViewer,snapshot,spec,snapshot.dpi),spec,snapshot.colorbar,snapshot.paperWidth):new DOMParser().parseFromString(svgForExport(),'image/svg+xml').documentElement,vb=root.getAttribute('viewBox').split(/[ ,]+/).map(Number),options={widthMm:snapshot.paperWidth,heightMm:snapshot.paperWidth*vb[3]/vb[2],dpi:snapshot.dpi,background:snapshot.transparent?null:snapshot.background,format},svg=new XMLSerializer().serializeToString(root);
        const result=format==='pdf'?await window.AtlasFigureExport.pdf([{svg,...options}],{title:snapshot.projectName,dpi:snapshot.dpi}):{blob:await window.AtlasFigureExport.bitmap(svg,options)};
        saveFile(result.blob,downloadName);elements.exportStatus.textContent=format==='pdf'?`PDF 已导出 · ${options.widthMm.toFixed(1)} × ${options.heightMm.toFixed(1)} mm · 二维矢量 / 影像位图`:`TIFF 已导出 · ${snapshot.dpi} dpi · ${snapshot.transparent?'RGBA 透明':'RGB 背景色'}`;return;
      }
      if(state.mode==='3d'){
        if(format!=='png')throw new Error('3D 请使用 PNG 导出；矢量 SVG 仅适用于二维模式');
        if(!meshViewer)throw new Error('三维图谱尚未就绪');
        const spec=threeDColourSpec(),width=Math.round(state.paperWidth/25.4*state.dpi),source=await capture3DSource(meshViewer,structuredClone(state),spec,state.dpi),root=colorbars.dock(source,spec,state.colorbar,state.paperWidth),png=await rasterPublicationSVG(root,state.paperWidth,state.dpi);
        const bytes=utils.withPngDpi(await png.arrayBuffer(),state.dpi);saveFile(new Blob([bytes],{type:'image/png'}),filename('png'));
        elements.exportStatus.textContent=`3D PNG 已导出 · ${width} px · ${state.dpi} dpi`;return;
      }
      const downloadName = filename(format);
      const exportDpi = state.dpi;
      const exportWidthMm = state.paperWidth;
      const exportBackground=state.transparent?null:state.background;
      const exportRatio = currentSvg.viewBox.baseVal.height / currentSvg.viewBox.baseVal.width;
      if (format === "svg") {
        saveFile(new Blob([svgForExport()], {type: "image/svg+xml;charset=utf-8"}), downloadName);
        elements.exportStatus.textContent = "SVG 已导出 · 文字与路径可编辑";
      } else {
        const width = Math.round(exportWidthMm / 25.4 * exportDpi);
        const markup = svgForExport(width), svgUrl = URL.createObjectURL(new Blob([markup], {type: "image/svg+xml;charset=utf-8"}));
        try {
          const image = new Image(); image.src = svgUrl; await image.decode();
          const canvas = document.createElement("canvas"); canvas.width = width;
          canvas.height = Math.round(width * exportRatio);
          utils.paintCanvas(canvas,image,exportBackground);
          const png = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG 编码失败")), "image/png"));
          const output = utils.withPngDpi(await png.arrayBuffer(), exportDpi);
          saveFile(new Blob([output], {type: "image/png"}), downloadName);
          elements.exportStatus.textContent = `${canvas.width} × ${canvas.height} px · ${exportDpi} dpi · 已导出`;
        } finally { URL.revokeObjectURL(svgUrl); }
      }
    } catch (exception) { elements.exportStatus.textContent = "导出失败：" + exception.message; }
    finally {for(const id of ['exportSVG','exportPNG','exportPDF','exportTIFF'])elements[id].disabled=false;elements.exportSVG.disabled=state.mode==='3d';}
  }
  function exportValueCSV(template) {
    const family = state.assignmentTarget === "family", tree = state.assignmentTarget === "tree";
    const rows=[],mapping=assignmentMap(),identifier=family?'family':tree?'structure_id':'region';
    for(const entry of editorEntries())for(const hemisphere of template?[state.assignmentHemisphere]:pro.hemispheres){
      const key=pro.key(entry.id,hemisphere);if(!template&&!Object.hasOwn(mapping,key))continue;
      const statistics=state.statistics[`${state.assignmentTarget}:${key}`]||{};
      rows.push({[identifier]:entry.id,...(!family&&!tree?{structure_id:entry.structureId??''}:{}),name:entry.name||entry.id,
        hemisphere,value:template?'':mapping[key],p:template?'':statistics.p??'',q:template?'':statistics.q??'',n:template?'':statistics.n??''});
    }
    const fields=[identifier,...(!family&&!tree?['structure_id']:[]),'name','hemisphere','value','p','q','n'];
    const csv = "\uFEFF" + window.Papa.unparse({fields,data:rows.map(row=>fields.map(field=>row[field]))});
    saveFile(new Blob([csv], {type: "text/csv;charset=utf-8"}),
      `mouse_atlas_${state.assignmentTarget}_${template ? "template" : "values_all_hemispheres"}.csv`);
  }
  for (const network of data.networks) {
    const option = document.createElement("option"); option.value = network.id; option.textContent = network.title; elements.layer.append(option);
  }
  elements.orientation.addEventListener("change", event => {
    stopPlayback(); change(() => { state.orientation = event.target.value; state.selected = selection(state.orientation, state.rows * state.columns);[state.intervalStart,state.intervalMm]={coronal:[2,1.2],sagittal:[-4,1.1],horizontal:[1,.8]}[state.orientation]; });
  });
  elements.singleMode.addEventListener("click", () => change(() => { state.mode = "single"; }));
  elements.gridMode.addEventListener("click", () => change(() => { state.mode = "grid"; }));
  for (const key of ["rows", "columns"]) elements[key].addEventListener("change", event => {
    const value = Number(event.target.value);
    if (event.target.value === "" || !Number.isFinite(value)) { sync(); return; }
    stopPlayback(); change(() => {
      state[key] = utils.clamp(Math.round(value), 1, 8);
      state.selected = selection(state.orientation, state.rows * state.columns);
    });
  });
  elements.uniformSlices.addEventListener("click", () => {
    stopPlayback(); change(() => { state.selected = selection(state.orientation, state.rows * state.columns); });
  });
  for(const key of ['panelGapX','panelGapY'])elements[key].addEventListener('input',event=>change(()=>{state[key]=Number(event.target.value);}));
  elements.resetPanelGaps.addEventListener('click',()=>change(()=>{state.panelGapX=24;state.panelGapY=24;}));
  for(const key of ['intervalStart','intervalMm'])elements[key].addEventListener('change',event=>{
    const value=Number(event.target.value);if(event.target.value===''||!Number.isFinite(value)){sync();return;}
    change(()=>{state[key]=value;},false);
  });
  elements.applyInterval.addEventListener('click',()=>{
    if(state.mode!=='grid')return;const result=intervalPreview();if(!result.ok){syncSpacingControls();return;}
    stopPlayback();change(()=>{state.selected=[...result.indices];});
  });
  elements.orthoMode.addEventListener('click',()=>{stopPlayback();change(()=>{state.mode='ortho';});});
  elements.meshMode.addEventListener('click',()=>{stopPlayback();change(()=>{state.mode='3d';});});
  elements.meshToSlices.addEventListener('click',()=>change(()=>{state.mode='ortho';}));
  for(const [id,preset]of [['reset3d','default'],['dorsal3d','dorsal'],['ventral3d','ventral'],['anterior3d','anterior'],['posterior3d','posterior'],['right3d','right'],['left3d','left']])elements[id].addEventListener('click',()=>meshViewer?.preset(preset));
  elements.shellOpacity.addEventListener('input',event=>change(()=>{state.shellOpacity=Number(event.target.value);}));
  elements.smoothing3d.addEventListener('input',event=>{
    change(()=>{state.smoothing3d=Number(event.target.value);},false);
    clearTimeout(smoothingTimer);smoothingTimer=setTimeout(()=>{smoothingTimer=null;requestRender();},120);
  });
  elements.smoothing3d.addEventListener('change',()=>{clearTimeout(smoothingTimer);smoothingTimer=null;requestRender();});
  for(const [id,strength]of [['smoothOff3d',0],['smoothStandard3d',100],['smoothStrong3d',200]])elements[id].addEventListener('click',()=>{
    clearTimeout(smoothingTimer);smoothingTimer=null;change(()=>{state.smoothing3d=strength;});
  });
  elements.coordinateMode.addEventListener('change',event=>change(()=>{state.coordinateMode=event.target.value;}));
  for(const [id,orientation]of [['planeAP','coronal'],['planeML','sagittal'],['planeDV','horizontal']])elements[id].addEventListener('change',event=>change(()=>{state.planeVisibility[orientation]=event.target.checked;}));
  for(const [id,axis]of [['cursorAP','ap'],['cursorML','ml'],['cursorDV','dv']])elements[id].addEventListener('change',event=>{const value=Number(event.target.value);if(event.target.value!==''&&Number.isFinite(value))change(()=>{state.crosshair[axis]=value;});else sync();});
  elements.showCrosshair.addEventListener('change',event=>change(()=>{state.showCrosshair=event.target.checked;}));
  elements.sliceRange.addEventListener("input", event => setSlice(Number(event.target.value)));
  elements.positionInput.addEventListener("change", event => {
    const position = Number(event.target.value);
    if (Number.isFinite(position)) setSlice(utils.closestSlice(currentPlane().slices, position));
  });
  elements.previousSlice.addEventListener("click", () => step(-1));
  elements.nextSlice.addEventListener("click", () => step(1));
  elements.playSlices.addEventListener("click", () => {
    if (playback) { stopPlayback(); return; }
    elements.playSlices.innerHTML = '<i data-lucide="pause"></i>'; icons();
    elements.playSlices.setAttribute("aria-label", "暂停片层"); elements.playSlices.title = "暂停片层";
    playback = setInterval(() => {
      if (Number(elements.sliceRange.value) >= currentPlane().slices.length - 1) stopPlayback(); else step(1);
    }, 280);
  });
  for (const key of ["hemisphere", "assignmentHemisphere", "layer", "palette", "lineColour", "background", "regionNameFormat", "regionNameDensity", "assignmentTarget", "customMap", "valueTitle", "missingColour"]) elements[key].addEventListener("change", event => change(() => { state[key] = event.target.value; }));
  for (const key of ["borders", "outline", "transparent", "showLabels", "showScale", "showRegionNames","publicationStyle"]) elements[key].addEventListener("change", event => change(() => { state[key] = event.target.checked; }));
  elements.applyPublication.addEventListener('click',()=>{research?.publicationStyle();change(()=>{Object.assign(state,{publicationStyle:true,paperWidth:Number(elements.publicationPreset.value),dpi:600,transparent:false,background:'#ffffff',sliceDepth:false,showCrosshair:false,coordinateMode:'none',show3dPlanes:false,fillOpacity:100,borders:false,outline:false,lineColour:'#333333',lineWidth:.3,outlineWidth:.5,showLabels:true,showScale:true,showRegionNames:false,regionNameSize:7});state.colorbar=colorbars.clean({...state.colorbar,fontPt:7,lengthMm:38,thicknessMm:1.7,tickCount:3});});});
  elements.sliceDepth.addEventListener('change',event=>change(()=>{state.sliceDepth=event.target.checked;}));
  elements.sliceRotate.addEventListener('change',event=>change(()=>{state.sliceRotate=event.target.checked;},false));
  for(const key of ['sliceThickness','sliceShadow','slicePitch','sliceYaw'])elements[key].addEventListener('input',event=>change(()=>{state[key]=Number(event.target.value);}));
  for(const[id,pitch,yaw]of [['sliceFront',0,0],['sliceOblique',20,-18]])elements[id].addEventListener('click',()=>change(()=>{state.slicePitch=pitch;state.sliceYaw=yaw;}));
  sliceDepth.bindRotation(elements.figure,{
    enabled:()=>state.mode==='single'&&state.sliceDepth&&state.sliceRotate,
    getAngles:()=>({pitch:state.slicePitch,yaw:state.sliceYaw}),
    onInput:angles=>{state.slicePitch=angles.pitch;state.sliceYaw=angles.yaw;syncSliceDepthControls();requestRender();},
    onCommit:()=>change(()=>{})
  });
  for (const key of ["fillOpacity", "lineWidth", "outlineWidth", "zoom", "regionNameSize"]) elements[key].addEventListener("input", event => change(() => { state[key] = Number(event.target.value); }, key !== "zoom"));
  for (const key of ["paperWidth", "dpi"]) elements[key].addEventListener("change", event => change(() => { state[key] = Number(event.target.value); }, key !== "dpi"));
  elements.exportSVG.addEventListener("click", () => exportImage("svg"));
  elements.exportPNG.addEventListener("click", () => exportImage("png"));
  elements.exportPDF.addEventListener('click',()=>exportImage('pdf'));
  elements.exportTIFF.addEventListener('click',()=>exportImage('tiff'));
  elements.regionSearch.addEventListener("input", event => { regionQuery = event.target.value; syncValueEditor(); });
  elements.treeSearch.addEventListener("input",event=>{treeQuery=event.target.value;syncTree();});
  elements.selectionOnly.addEventListener("change",event=>change(()=>{state.selectionOnly=event.target.checked;}));
  elements.clearSelection.addEventListener("click",()=>change(()=>{state.selectedStructures=[];}));
  for(const key of ['valueKind','valueUnit','statFilter'])elements[key].addEventListener('change',event=>change(()=>{state[key]=event.target.value;state.layer='custom';}));
  for(const key of ['statThreshold','absoluteThreshold'])elements[key].addEventListener('change',event=>{
    const value=Number(event.target.value);if(event.target.value===''||!Number.isFinite(value)||value<0||(key==='statThreshold'&&value>1)){elements.valueStatus.textContent='阈值无效';sync();return;}
    change(()=>{state[key]=value;state.layer='custom';});
  });
  elements.symmetricRange.addEventListener('change',event=>change(()=>{state.symmetricRange=event.target.checked;if(state.symmetricRange){if(valueTools.mapInfo[state.customMap]?.kind!=='diverging')state.customMap='diverging';if(!state.autoRange){const maximum=Math.max(Math.abs(state.valueMin),Math.abs(state.valueMax));state.valueMin=-maximum;state.valueMax=maximum;}}}));
  for(const key of ['projectName','projectSource','projectNotes'])elements[key].addEventListener('change',event=>change(()=>{state[key]=event.target.value;},key==='projectSource'||key==='projectName'));
  elements.autoRange.addEventListener("change", event => {
    const range = customRange();
    change(() => { state.autoRange = event.target.checked; if (!state.autoRange) { state.valueMin = range[0]; state.valueMax = range[1]; } });
  });
  function manualRangeChanged() {
    const minimum = Number(elements.valueMin.value), maximum = Number(elements.valueMax.value);
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) {
      elements.valueStatus.textContent = "色阶下限必须小于上限"; return;
    }
    change(() => { state.valueMin = state.symmetricRange ? -Math.max(Math.abs(minimum),Math.abs(maximum)) : minimum; state.valueMax = state.symmetricRange ? -state.valueMin : maximum; });
    elements.valueStatus.textContent = "手动色阶已更新";
  }
  elements.valueMin.addEventListener("change", manualRangeChanged);
  elements.valueMax.addEventListener("change", manualRangeChanged);
  elements.applyValues.addEventListener("click", () => change(() => { state.layer = "custom"; }));
  elements.downloadTemplate.addEventListener("click", () => exportValueCSV(true));
  elements.exportValues.addEventListener("click", () => exportValueCSV(false));
  elements.importValues.addEventListener("click", () => elements.valuesFile.click());
  elements.valuesFile.addEventListener("change", async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const text=await file.text();
      const result = pro.parseCSV(text, state.assignmentTarget, data, window.Papa, state.assignmentHemisphere);
      const count = Object.keys(result.patch).length;
      if (!count) throw new Error("没有匹配到有效分区，请使用下载的模板填写");
      change(() => {
        importHistory.push({file:file.name,importedAt:new Date().toISOString(),target:state.assignmentTarget,hemisphere:state.assignmentHemisphere,text,
          report:{rows:result.rows,updated:count,unknown:result.unknown,invalid:result.invalid,duplicates:result.duplicates}});
        const mapping = assignmentMap();
        for (const [key, value] of Object.entries(result.patch)) {
          if (value === null) delete mapping[key]; else mapping[key] = value;
          delete state.statistics[`${state.assignmentTarget}:${key}`];
        }
        Object.assign(state.statistics,result.statistics);
        state.layer = "custom";
      });
      elements.valueStatus.textContent = `已更新 ${count} 项` +
        (result.unknown.length ? `；未匹配 ${result.unknown.length} 项（${result.unknown.slice(0, 3).map(item=>item.id).join(", ")}）` : "") +
        (result.invalid.length ? `；无效数值 ${result.invalid.length} 行` : "") +
        (result.duplicates ? `；重复 ${result.duplicates} 项，使用最后一行` : "");
    } catch (exception) { elements.valueStatus.textContent = "导入失败：" + exception.message; }
    elements.valuesFile.value = "";
  });
  elements.resetSettings.addEventListener("click", () => { stopPlayback();meshPicked=null;research?.reset();publication?.reset();nifti?.reset();advancedMRI?.reset(); regionQuery = ""; elements.regionSearch.value = "";treeQuery='';elements.treeSearch.value='';change(() => { state = defaults();importHistory=[]; }); elements.valueStatus.textContent = "";elements.projectStatus.textContent='已恢复默认；原项目文件不受影响。'; });
  elements.saveSettings.addEventListener("click", () => {
    const project=completeProject();
    const name=(state.projectName||'mouse_atlas_project').replace(/[\\/:*?"<>|]/g,'_');
    saveFile(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),name+'.mouseatlas.json');
    elements.projectStatus.textContent='完整项目已导出 · 含原始 CSV、统计量、选区和所有设置';
  });
  elements.importSettings.addEventListener("click", () => elements.settingsFile.click());
  elements.settingsFile.addEventListener("change", async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      const settings = JSON.parse(await file.text());
      let loaded,history=[];
      if(settings.format==='mouse-atlas-project'){const project=pro.readProject(settings,data);loaded=sanitise(project.state);history=project.history;}
      else{if(settings.version!==1)throw new Error('不支持的项目或旧设置版本');loaded=sanitise(settings);}
      stopPlayback();regionQuery='';elements.regionSearch.value='';treeQuery='';elements.treeSearch.value='';
      if(research)await research.restore(settings.research);
      await publication?.restore(settings.publication);
      await nifti?.restore(settings.niftiStats);
      await advancedMRI?.restore(settings.advancedMRI);
      change(() => { state = loaded;importHistory=history; }); elements.projectStatus.textContent = settings.format?'完整项目已恢复 · '+file.name:'旧设置已载入；可另存为完整项目';
    } catch (exception) { elements.projectStatus.textContent = "载入失败：" + exception.message; }
    elements.settingsFile.value = "";
  });
  document.addEventListener("keydown", event => {
    if(document.querySelector('dialog[open]'))return;
    if (event.target.closest("input,select,button,textarea")) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); step(event.key === "ArrowRight" ? 1 : -1); }
  });
function completeProject(){const project=pro.project(data,state,importHistory);project.appVersion='3.20.0-beta.1';if(research){project.version=2;project.research=research.snapshot(true);}if(publication)project.publication=publication.snapshot();if(nifti?.snapshot(false))project.niftiStats=nifti.snapshot(true);const adv=advancedMRI?.snapshot();if(adv)project.advancedMRI=adv;return project;}
  async function rasterPublicationSVG(root,widthMm,dpi){const width=Math.round(widthMm/25.4*dpi),vb=root.getAttribute('viewBox').split(/[ ,]+/).map(Number),clone=root.cloneNode(true),background=root.querySelector('[data-canvas-background]')?.getAttribute('fill')||null;clone.setAttribute('width',width);clone.setAttribute('height',Math.round(width*vb[3]/vb[2]));const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}));try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width*vb[3]/vb[2]);utils.paintCanvas(canvas,image,background);return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 编码失败')),'image/png'));}finally{URL.revokeObjectURL(url);}}
  async function capture3DSource(viewer,snapshot,spec,dpi=300){
    const root=await capture3DBase(viewer,snapshot,spec,dpi),mf=viewer.merfishPlan;
    if(mf?.enabled){const texts=[...root.querySelectorAll(':scope > text')],regional=window.AtlasMerfishRegions.active(mf);
      if(texts[0]?.textContent==='Allen CCF 3D region surfaces'||regional){texts[0].textContent='MERFISH | '+(mf.settings.mode==='gene'?mf.data.gene.symbol:mf.settings.cellType||mf.settings.level)+(regional?' | CCF regional heatmap':' | CCF point cloud');texts[1].textContent=mf.data.datasets.join(' + ')+' | Registered CCF native mm | '+(regional?mf.data.regional.title:mf.settings.mode==='gene'?'Source log2-normalized expression':'WMB taxonomy colours');for(const text of texts)if(text.textContent.startsWith('Display surfaces only;'))text.textContent=regional?'Full-population regional summaries; display surfaces are not volumetric measurements. Surface lighting affects appearance. Not bregma.':'Registered cell centres; display point size is not soma size. Not bregma.';}
      if(snapshot.publicationStyle){const view=root.getAttribute('viewBox').split(/[ ,]+/).map(Number),p=view[2]/(snapshot.paperWidth/25.4*72),image=root.querySelector('image[data-3d-scene]');if(image){for(const text of root.querySelectorAll(':scope > text'))text.remove();const y=8*p*2.2,h=Number(image.getAttribute('height'));image.setAttribute('y',y);view[3]=y+h+7*p*2;root.setAttribute('viewBox',view.join(' '));for(const bg of root.querySelectorAll(':scope > rect[data-canvas-background]'))bg.setAttribute('height',view[3]);root.append(svgElement('text',{x:24,y:8*p,'font-size':8*p,'font-weight':700,fill:'#222222'},regional?window.AtlasMerfishRegions.title(mf):'MERFISH · '+(mf.data.gene?.symbol||mf.settings.level)),svgElement('text',{x:24,y:y+h+7*p*1.4,'font-size':6.5*p,fill:'#555555'},regional?'CCF regional summaries; surface lighting affects appearance.':'Registered cell centres; display point size is not soma size.'));root.setAttribute('data-publication-style','true');}}
    }
    if(viewer.aavPlan?.enabled&&!mf?.enabled){const texts=[...root.querySelectorAll(':scope > text')];if(texts[0])texts[0].textContent='Allen AAV | '+viewer.aavPlan.data.experiment.sourceAcronym+' | '+viewer.aavPlan.data.experiment.id;}
    return research?.decorateMerfish(root,mf||null,snapshot,viewer.aavPlan||null)||root;
  }
  async function capture3DBase(viewer,snapshot,spec,dpi=300){const width=Math.round(snapshot.paperWidth/25.4*dpi),png=await viewer.captureScene(width),url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('3D 场景读取失败'));reader.readAsDataURL(png);});
    const fc=viewer.connectomePlan;if(fc?.enabled){const s=fc.settings,root=svgElement('svg',{xmlns:namespace,viewBox:'0 0 1200 1120','font-family':'Arial, Microsoft YaHei, sans-serif'});if(!snapshot.transparent)root.append(svgElement('rect',{width:1200,height:1120,fill:snapshot.background,'data-canvas-background':'true'}));root.append(svgElement('metadata',{},JSON.stringify({format:'mouse-atlas-functional-connectome',version:1,metric:s.metric,directed:s.directed,settings:s,diagnostics:fc.diagnostics,nodes:fc.nodes.map(({id,region,hemisphere,ap,ml,dv,value,degree,strength,radius,positionSource})=>({id,region,hemisphere,ap,ml,dv,value,degree,strength,radius,positionSource})),edges:fc.edges.map(({source,target,weight,p,q,radius})=>({source,target,weight,p,q,radius})),sources:fc.sources})));
      const text=(y,value,size=14,x=35)=>root.append(svgElement('text',{x,y,'font-size':size,fill:'#52695d'},value)),simulated=/simulated/i.test(fc.sources?.filter(s=>s.kind==='connections').at(-1)?.name||'');text(32,(simulated?'SIMULATED | ':'')+'Functional connectivity | Ball-and-stick',22);text(58,`${s.metric} | ${s.directed?'Directed (imported)':'Undirected'} | ${fc.nodes.length} nodes / ${fc.edges.length} edges | CCF native mm`);root.append(svgElement('image',{x:0,y:80,width:1200,height:780,href:url,'data-3d-scene':'true','data-connectome-scene':'true'}));text(890,`|weight| >= ${s.threshold} | Sign: ${s.sign} | Top ${s.limit} | ${s.statFilter==='none'?'No p/q filter':`Imported ${s.statFilter} <= ${s.statThreshold}`} | Max |weight|: ${Number(fc.maxWeight.toPrecision(5))}`);
      root.append(svgElement('circle',{cx:46,cy:922,r:9,fill:s.nodeColour==='uniform'?s.uniformColour:'#a0bba3'}));text(927,`Nodes: ${s.nodeSize} | Scale x${s.nodeScale} | Colour: ${s.nodeColour} | Individual diameters take priority`,14,65);root.append(svgElement('line',{x1:35,x2:83,y1:956,y2:956,stroke:s.positiveColour,'stroke-width':5}));text(961,'Positive',14,95);root.append(svgElement('line',{x1:245,x2:293,y1:956,y2:956,stroke:s.negativeColour,'stroke-width':5}));text(961,'Negative',14,305);text(961,`Cylinders: ${s.edgeSize==='fixed'?'fixed radius':'area scales with |weight|'} | Scale x${s.edgeScale}`,14,430);const range=rows=>rows.length?[Math.min(...rows.map(n=>n.radius)),Math.max(...rows.map(n=>n.radius))].map(n=>Number(n.toPrecision(4))).join('-'):'none';text(993,`Actual display radii: nodes ${range(fc.nodes)} mm; edges ${range(fc.edges)} mm. Not physical ROI sizes.`);text(1020,`Missing coordinates: ${fc.diagnostics.missingNodes.length}; missing p/q: ${fc.diagnostics.missingStats}; excluded by edge limit: ${fc.diagnostics.limited}.`);text(1051,s.nodeColour==='value'?`Node value colours: blue ${fc.valueRange[0]} / white 0 / red ${fc.valueRange[1]}`:'Positions: Allen 100-um centroids or imported CCF mm. No registration performed.');text(1080,'Connectors are schematic associations, not fiber trajectories or causal evidence. Not bregma.');if(viewer.implantPlan?.enabled)root.append(svgElement('metadata',{'data-implant-metadata':'true'},JSON.stringify(viewer.implantPlan)));text(1105,'Allen CCF 2020 / 20230630 | '+snapshot.projectName+(viewer.implantPlan?.enabled?' | Sites/electrodes also shown (schematic)':''),13);return root;}
    if(viewer.implantPlan?.enabled&&viewer.implantPlan.appearance?.style==='publication'){const m=viewer.implantPlan,root=svgElement('svg',{xmlns:namespace,viewBox:'0 0 1200 780','font-family':'Arial, Microsoft YaHei, sans-serif'});if(!snapshot.transparent)root.append(svgElement('rect',{width:1200,height:780,fill:snapshot.background,'data-canvas-background':'true'}));root.append(svgElement('metadata',{'data-implant-publication':'true'},JSON.stringify({format:'mouse-atlas-implant-publication',version:1,coordinateSpace:'Allen CCF native mm; not bregma',geometry:'illustrative hardware; coordinates supplied by user',implants:m})));root.append(svgElement('image',{x:0,y:0,width:1200,height:780,href:url,'data-3d-scene':'true','data-implant-scene':'true'}));const labels=viewer.implantLabelsSVG(1200,780,snapshot.paperWidth);if(labels)root.append(labels);return root;}
    if(viewer.implantPlan?.enabled){const m=viewer.implantPlan,root=svgElement('svg',{xmlns:namespace,viewBox:'0 0 1200 970','font-family':'Arial, Microsoft YaHei, sans-serif'});if(!snapshot.transparent)root.append(svgElement('rect',{width:1200,height:970,fill:snapshot.background,'data-canvas-background':'true'}));root.append(svgElement('metadata',{},JSON.stringify({format:'mouse-atlas-glass-brain-implants',version:1,coordinateSpace:'Allen CCF native mm, not bregma',implants:m})));const text=(y,value,size=14)=>root.append(svgElement('text',{x:35,y,'font-size':size,fill:'#52695d'},value));text(32,(m.items.some(x=>/SIMULATED/.test(x.label))?'SIMULATED | ':'')+(m.glass?'Glass brain':'Brain')+' | Sites and electrodes',22);text(58,`${m.items.length} objects | CCF native mm | Hollow sites | Entry-to-tip electrode coordinates`);root.append(svgElement('image',{x:0,y:80,width:1200,height:780,href:url,'data-3d-scene':'true','data-implant-scene':'true'}));const labelLayer=viewer.implantLabelsSVG(1200,780,snapshot.paperWidth);if(labelLayer){labelLayer.setAttribute('transform','translate(0 80)');root.append(labelLayer);}text(892,'Hollow sites; entry-to-tip trajectories; illustrative shanks/contacts, not manufacturer CAD.');text(921,'CCF-registered coordinates | Labels: '+ (m.appearance?.style==='publication'?m.appearance.labelPt+' pt vector / automatic layout':'classic')+' | Not bregma or surgery planning.');text(950,'Allen CCF 2020 / 20230630 | '+snapshot.projectName,13);return root;}
    const root=svgElement('svg',{xmlns:namespace,viewBox:'0 0 1200 950','font-family':'Arial, Microsoft YaHei, sans-serif'});if(!snapshot.transparent)root.append(svgElement('rect',{width:1200,height:950,fill:snapshot.background,'data-canvas-background':'true'}));
    root.append(svgElement('text',{x:35,y:32,'font-size':22,'font-weight':700,fill:'#254438'},'Allen CCF 3D region surfaces'));
    root.append(svgElement('text',{x:35,y:58,'font-size':13,fill:'#6c7f73'},`100-um mesh | Smoothing ${snapshot.smoothing3d}/200 | ${spec?.title||'Allen anatomy'}`));
    root.append(svgElement('image',{x:0,y:80,width:1200,height:780,href:url,'data-3d-scene':'true'}));
    root.append(svgElement('text',{x:35,y:885,'font-size':13,fill:'#617367'},snapshot.statFilter==='none'?'No statistical threshold':snapshot.statFilter==='value'?`|value| >= ${snapshot.absoluteThreshold}`:`${snapshot.statFilter} <= ${snapshot.statThreshold} (imported)`));
    root.append(svgElement('text',{x:35,y:915,'font-size':13,fill:'#617367'},'Display surfaces only; not for volumetry. 356/357 structures; c absent at 100 um. Not bregma.'));
    root.append(svgElement('text',{x:35,y:935,'font-size':13,fill:'#617367'},'Allen CCF 2020 / 20230630 | '+snapshot.projectName));return root;
  }
  function meshRecipe(){const range=customRange(),network=currentNetwork();return{version:1,fingerprint:data.fingerprint,state:structuredClone(state),dpi:300,records:data.regions.flatMap((r,index)=>['L','R'].map(hemi=>({index,hemi,value:state.layer==='custom'?customValue(index,hemi):network?.values[index]??null,colour:colour(index,range,hemi),selected:selectedRegion(r),assigned:state.layer==='custom'?pro.passes(pro.resolve(r,hemi,state),state):(network?.values[index]??0)>0}))),scene:research?.scene3D()||{points:[],edges:[],tracks:[],directed:true,pointSize:.075,hemisphere:state.hemisphere}};}
  async function recolourPublication3D(panel,config){const recipe=panel.provenance?.meshRecipe,spec=panel.provenance?.colourMapping;if(!recipe||recipe.fingerprint!==data.fingerprint||!spec)throw new Error('这个旧 3D 快照没有重渲染配方，请在主视图重新加入');const viewer=await ensureMeshViewer(),records=new Map(recipe.records.map(r=>[r.index+'|'+r.hemi,r]));
    try{viewer.setActive(true);const snapshot={...recipe.state,colorbar:config};viewer.update({state:snapshot,colour:(index,hemi)=>colorbars.colour(records.get(index+'|'+hemi)?.value,spec,config),selected:index=>records.get(index+'|L')?.selected,assigned:(index,hemi)=>records.get(index+'|'+hemi)?.assigned});viewer.setResearch({...recipe.scene,hemisphere:snapshot.hemisphere,revision:'publication-'+Date.now()});const source=await capture3DSource(viewer,snapshot,spec,recipe.dpi);return new XMLSerializer().serializeToString(source);}finally{await requestRender();}}
  async function capturePublication(kind){
    stopPlayback();await readyPromise;
    const provenance={capturedAt:new Date().toISOString(),atlasId:data.atlasId,fingerprint:data.fingerprint,project:state.projectName,source:state.projectSource,
      layer:state.layer,hemisphere:state.hemisphere,description:'',colourMapping:state.mode==='3d'?threeDColourSpec():colourSpec(),colorbarVersion:2,capturedColorbar:structuredClone(state.colorbar)};
    const activeAav=research?.aavSummary();if(activeAav?.enabled&&activeAav.loaded)provenance.aav=activeAav;
    if(kind==='chart'){
      const chart=document.querySelector('#rChart svg');if(!chart)throw new Error('请先在研究工作台计算组间比较，生成动物散点图');
      provenance.description=chart.querySelector('text')?.textContent||'Independent animal statistics';provenance.colourMapping=null;
      return{svg:new XMLSerializer().serializeToString(chart),title:'',kind:'chart',provenance};
    }
    if(state.mode==='3d'){
      if(kind==='slice')throw new Error('请先切换到二维视图；3D 请用“完整当前视图 / 3D”');
      if(!meshViewer)throw new Error('三维图谱尚未就绪');const width=Math.round(state.paperWidth/25.4*300),root=await capture3DSource(meshViewer,structuredClone(state),provenance.colourMapping);
      Object.assign(provenance,{description:`3D · smoothing ${state.smoothing3d}/200`,camera:structuredClone(state.camera3d),rasterPixels:[width,Math.round(width*.65)],smoothing:state.smoothing3d,meshRecipe:meshRecipe()});
      if(meshViewer.connectomePlan?.enabled){provenance.connectome=research.connectomeSummary();provenance.description='Functional connectivity · '+provenance.connectome.metric+' · '+provenance.connectome.diagnostics.visibleEdges+' edges';}
      return{svg:new XMLSerializer().serializeToString(root),kind:'3d',title:'',provenance,colorbar:structuredClone(state.colorbar)};
    }
    if(!currentSvg)throw new Error('切面尚未就绪');
    if(kind==='view'){
      provenance.description=state.mode==='ortho'?'Linked orthogonal views':`${currentPlane().title} · ${state.mode==='grid'?state.selected.length+' sections':coordinate(currentRecord())}`;
      provenance.figureMetadata=JSON.parse(currentSvg.querySelector('metadata').textContent);
      const base=colorbars.detach(currentSvg.cloneNode(true));provenance.mappingLocked=!!base.querySelector('[data-quantitative-raster]');return{svg:new XMLSerializer().serializeToString(base),kind:'view',title:'',provenance,colorbar:structuredClone(state.colorbar)};
    }
    const panel=state.mode==='ortho'?currentSvg.querySelector(`[data-orientation="${state.orientation}"]`):currentSvg.querySelector(`[data-panel="${state.active}"]`);
    if(!panel)throw new Error('未找到活动切面');
    const bounds=panel.getBBox(),shapes=panel.querySelector('.anatomy-space'),tilted=shapes?.dataset.displayTilted==='true',extra=state.showScale&&!tilted?30:0,filtered=state.layer==='custom'&&state.statFilter!=='none';
    const root=svgElement('svg',{xmlns:namespace,viewBox:`${bounds.x-8} ${bounds.y-5} ${bounds.width+16} ${bounds.height+10+extra+(filtered?22:0)}`,'font-family':'Arial, Microsoft YaHei, sans-serif'});
    for(const defs of currentSvg.querySelectorAll(':scope > defs'))root.append(defs.cloneNode(true));root.append(panel.cloneNode(true));
    if(extra&&shapes){const matrix=shapes.transform.baseVal.consolidate().matrix,length=100*Math.hypot(matrix.a,matrix.b),x=bounds.x+10,y=bounds.y+bounds.height+18;root.append(svgElement('line',{x1:x,x2:x+length,y1:y,y2:y,stroke:'#334b3d','stroke-width':1,'data-scale-mm':1,'data-slice-scale-line':'true'}));root.append(svgElement('text',{x:x+length/2,y:y-5,'text-anchor':'middle','font-size':10,fill:'#526859','data-slice-scale-label':'true'},'1 mm'));}
    if(filtered){const description=state.statFilter==='value'?`|value| >= ${state.absoluteThreshold}`:`${state.statFilter} <= ${state.statThreshold} (imported; missing excluded)`;root.append(svgElement('text',{x:bounds.x+5,y:bounds.y+bounds.height+extra+17,'font-size':Math.min(10,(bounds.width-10)/(description.length*.56)),fill:'#65796b','data-stat-filter':state.statFilter},description));}
    provenance.description=coordinate(currentRecord());provenance.orientation=state.orientation;provenance.position=currentRecord().position;provenance.sliceDisplay=sliceDepth.clean(state);
    if(shapes){const matrix=shapes.transform.baseVal.consolidate()?.matrix;provenance.insetCalibration={version:1,valid:!tilted&&!!matrix,unitsPerMm:matrix?100*Math.hypot(matrix.a,matrix.b):null,orientation:state.orientation,position:currentRecord().position,space:'Allen CCF native, not bregma'};}
    provenance.mappingLocked=!!root.querySelector('[data-quantitative-raster]');
    const mf=research?.merfishSummary(),aav=research?.aavSummary();if(mf?.enabled&&mf.loaded)provenance.merfish=mf;if(aav?.enabled&&aav.loaded)provenance.aav=aav;if(provenance.merfish||provenance.aav)research.decorateMerfish(root);return{svg:new XMLSerializer().serializeToString(root),kind:'slice',title:'',provenance,colorbar:structuredClone(state.colorbar)};
  }
  function applyResearch({values,statistics={},title,unit='',hemisphere='B',range=null}){
    change(()=>{state.values=values;state.familyValues={};state.structureValues={};state.statistics=statistics;state.layer='custom';state.valueTitle=title;state.valueUnit=unit;state.hemisphere=hemisphere;state.statFilter='none';state.selectedStructures=[];state.selectionOnly=false;if(range){state.autoRange=false;state.valueMin=range[0];state.valueMax=range[1];state.customMap='diverging';state.symmetricRange=false;}else state.autoRange=true;});
  }
  research=window.AtlasResearch.create({getState:()=>structuredClone(state),getRange:customRange,rerender:requestRender,save:saveFile,project:completeProject,apply:applyResearch,
    setCanvas:patch=>change(()=>{if(typeof patch.transparent==='boolean')state.transparent=patch.transparent;if(/^#[0-9a-f]{6}$/i.test(patch.background||''))state.background=patch.background.toLowerCase();}),
    addPublication:sources=>publication.addSources(sources),
    async renderConditionCell(cell,quantity,config){const previous=structuredClone(state);try{research.setExportContext({rows:cell.rows,range:quantity.range,hemisphere:config.hemisphere,matrix:true});state=sanitise({...previous,orientation:config.orientation,mode:'single',selected:[cell.sliceIndex],active:0,rows:1,columns:1,layer:'custom',values:Object.fromEntries(cell.rows.filter(r=>Number.isFinite(r.value)).map(r=>[pro.key(r.region,config.hemisphere),r.value])),familyValues:{},structureValues:{},statistics:{},selectedStructures:[],selectionOnly:false,hemisphere:config.hemisphere,autoRange:false,symmetricRange:false,valueMin:quantity.range[0],valueMax:quantity.range[1],valueTitle:quantity.title,valueUnit:quantity.unit,valueKind:quantity.kind==='effect'?'effect':'value',customMap:quantity.map,colorbar:quantity.colorbar,statFilter:'none',sliceDepth:false,showLabels:false,showScale:false,showRegionNames:config.showNames,paperWidth:Math.max(80,config.cellWidth),fillOpacity:100});await requestRender();const source=await capturePublication('slice'),doc=new DOMParser().parseFromString(source.svg,'image/svg+xml');source.visibleRegions=new Set([...doc.querySelectorAll('path[data-region][data-value]')].filter(n=>n.getAttribute('data-value')!==''&&Number.isFinite(Number(n.getAttribute('data-value')))).map(n=>n.getAttribute('data-region'))).size;source.provenance.colourMapping=quantity.spec;return source;}finally{research.setExportContext(null);state=previous;await requestRender();sync();}},
    setMode:mode=>change(()=>{state.mode=mode;}),focus:ids=>change(()=>{state.selectedStructures=[...new Set(ids.map(id=>data.regions.find(r=>r.id===id)?.structureId).filter(Number.isFinite))];}),
    async renderAssignments(rows,{title,range,hemisphere}){const previous=structuredClone(state);try{research.setExportContext({rows,range,hemisphere});const values=Object.fromEntries(rows.filter(r=>Number.isFinite(r.value)).map(r=>[pro.key(r.region,hemisphere),r.value]));applyResearch({values,title,range,hemisphere,unit:rows[0]?.unit||''});await readyPromise;return svgForExport();}finally{research.setExportContext(null);change(()=>{state=previous;});await readyPromise;}},
    async svgPNG(markup){const width=Math.round(state.paperWidth/25.4*state.dpi),background=state.transparent?null:state.background,url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml'}));try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width*image.height/image.width);utils.paintCanvas(canvas,image,background);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNG编码失败');return utils.withPngDpi(await blob.arrayBuffer(),state.dpi);}finally{URL.revokeObjectURL(url);}}
  });
  publication=window.AtlasPublication.create({capture:capturePublication,recolour3D:recolourPublication3D,save:saveFile,projectName:()=>state.projectName,saveProject:()=>elements.saveSettings.click()});
  nifti=window.AtlasNiftiStats.create({save:saveFile,addPublication:sources=>publication.addSources(sources),saveProject:()=>elements.saveSettings.click(),openAdvanced:()=>advancedMRI.open(true)});
  advancedMRI=window.AtlasMRIAdvanced.create({save:saveFile,addPublication:sources=>publication.addSources(sources),saveProject:()=>elements.saveSettings.click(),source:()=>nifti.advancedSource()});
  elements.openMRIAdvanced.addEventListener('click',()=>{stopPlayback();advancedMRI.open();});
  elements.openNifti.addEventListener('click',()=>{stopPlayback();nifti.open();});
  const meshDisplay=document.createElement('div');meshDisplay.className='mesh-display';elements.meshStage.before(meshDisplay);meshDisplay.append(elements.meshStage,elements.meshLegend);
  colorbarEditor=colorbars.controls(elements.colorbarEditor,{prefix:'cb',getConfig:()=>state.colorbar,getSpec:colourSpec,maxLength:config=>config.orientation==='vertical'?Infinity:Math.max(5,state.paperWidth-30),onChange:config=>change(()=>{state.colorbar=config;})});
  elements.openPublication.addEventListener('click',()=>{stopPlayback();publication.open();});
  sync(); requestRender();
  window.AtlasStudio = Object.freeze({getState: () => structuredClone(state), getDataSummary: () => ({
    regions: data.regions.length, planes: Object.fromEntries(Object.entries(data.planes).map(([key, value]) => [key, value.slices.length]))
  }),get3DSummary:()=>meshViewer?.summary()||null,getResearchSummary:()=>research?.summary(),getPublicationSummary:()=>publication?.summary(),getNiftiSummary:()=>nifti?.summary(),getAdvancedMRISummary:()=>advancedMRI?.summary(),getProject:completeProject,ready: () => Promise.all([readyPromise,research?.ready,publication?.ready,publication?.flushed(),nifti?.ready(),advancedMRI?.ready()])});
})();
