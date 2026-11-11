(function (scope) {
  "use strict";
  const maps = Object.freeze({
    viridis: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"],
    teal: ["#e4e7e8", "#c3d9d6", "#72aaa8", "#0e5964"],
    diverging: ["#2166ac", "#92c5de", "#f7f7f7", "#f4a582", "#b2182b"],
    deep_contrast: ["#031a45", "#08306b", "#08519c", "#2171b5", "#f5f5f5", "#c9282d", "#a50026", "#7f001f", "#3f0013"],
    soft_contrast: ["#4b88ad", "#73a4c1", "#a0bfd2", "#cfdee8", "#f7f7f7", "#ead3cd", "#dbaaa0", "#cb867d", "#bd6962"],
    moderate_contrast: ["#3b7096", "#5b8aae", "#7fa7c6", "#a9c6dd", "#f7f7f7", "#e3adaa", "#cf8585", "#ba6968", "#a15251"],
    inferno: ["#000004", "#57106e", "#bc3754", "#f98e09", "#fcffa4"],
    ...scope.MOUSE_PUBLICATION_PALETTES?.maps
  });
  const mapInfo=Object.freeze({moderate_contrast:{name:'蓝—白—红 · 适中对比',kind:'diverging',group:'正负效应 · 双向色带',note:'适中饱和度的双向效应色带；零居中请开启对称范围。'},soft_contrast:{name:'柔蓝—白—柔红 · 轻量对比',kind:'diverging',group:'正负效应 · 双向色带',note:'较明亮、低饱和的蓝红端点；与脑图保持相同映射。'},deep_contrast:{name:'深蓝—白—深红 · 高对比',kind:'diverging',group:'正负效应 · 双向色带',note:'深色端点，高对比连续渐变；零居中时开启对称范围。同类图使用同一固定范围。'},viridis:{name:'Viridis · 紫—绿—黄',kind:'sequential',group:'连续强度 · 科学色带',note:'连续强度；保留既有5点色值以兼容旧图。'},inferno:{name:'Inferno · 黑—红—黄',kind:'sequential',group:'连续强度 · 科学色带',note:'连续强度；保留既有5点色值以兼容旧图。'},teal:{name:'Teal · 青绿',kind:'sequential',group:'连续强度 · 科学色带',note:'连续强度；保留既有青绿色带。'},diverging:{name:'蓝—白—红 · 经典',kind:'diverging',group:'正负效应 · 双向色带',note:'正负效应；零居中请开启对称范围。'},...scope.MOUSE_PUBLICATION_PALETTES?.info});
  const categorical=Object.freeze({legacy:{name:'原有分类色（8色）',colours:['#cc554e','#267eaa','#9a60b6','#3a9a70','#ce8a29','#6570bd','#c85b8b','#538783'],note:'保持已有项目的类别颜色。'},...scope.MOUSE_PUBLICATION_PALETTES?.categorical});
  function syncMapPreview(select,options={}){const root=select.parentElement.querySelector('[data-palette-preview]');if(!root)return;const meta=mapInfo[select.value],stops=maps[select.value];if(!stops)return;const parts=options.bins?Array.from({length:options.bins},(_,i)=>{const c=valueColour((i+.5)/options.bins,0,1,select.value,'#e0e3e4',options);return`${c} ${i/options.bins*100}%,${c} ${(i+1)/options.bins*100}%`;}):(options.reverse?[...stops].reverse():stops);root.querySelector('[data-palette-strip]').style.background='linear-gradient(to right,'+parts.join(',')+')';root.querySelector('[data-palette-note]').textContent=(meta?.note||'')+(options.reverse?' 已反转。':'');root.setAttribute('aria-label',(meta?.name||select.value)+'，从低值到高值');}
  function mountMapSelect(select){const old=select.value,groups=new Map();select.replaceChildren();for(const[id,colours]of Object.entries(maps)){const meta=mapInfo[id]||{},label=meta.group||'数值色带';if(!groups.has(label)){const g=document.createElement('optgroup');g.label=label;groups.set(label,g);select.append(g);}const option=document.createElement('option');option.value=id;option.textContent=meta.name||id;groups.get(label).append(option);}select.value=Object.hasOwn(maps,old)?old:'viridis';if(!select.parentElement.querySelector('[data-palette-preview]')){const root=document.createElement('span');root.dataset.palettePreview='true';root.className='palette-preview';root.innerHTML='<span data-palette-strip class="palette-strip"></span><span data-palette-note class="palette-note"></span>';select.after(root);select.addEventListener('change',()=>syncMapPreview(select));}syncMapPreview(select);}
  function mountCategoricalSelect(select){const old=select.value;select.replaceChildren();for(const[id,meta]of Object.entries(categorical)){const o=document.createElement('option');o.value=id;o.textContent=meta.name;select.append(o);}select.value=Object.hasOwn(categorical,old)?old:'legacy';}
  function resolvedValue(region, values, familyValues) {
    if (Object.hasOwn(values, region.id)) return values[region.id];
    if (Object.hasOwn(familyValues, region.family)) return familyValues[region.family];
    return null;
  }
  function valueRange(regions, values, familyValues, automatic, minimum, maximum) {
    if (!automatic && Number.isFinite(minimum) && Number.isFinite(maximum) && minimum < maximum) return [minimum, maximum];
    const assigned = regions.map(region => resolvedValue(region, values, familyValues)).filter(Number.isFinite);
    if (!assigned.length) return [0, 1];
    let lower = Math.min(...assigned), upper = Math.max(...assigned);
    if (lower === upper) { const span = Math.max(Math.abs(lower) * .1, .5); lower -= span; upper += span; }
    return [lower, upper];
  }
  function valueColour(value, minimum, maximum, mapName, missing = "#e0e3e4", options = null) {
    if (!Number.isFinite(value)) return missing;
    const stops = maps[mapName] || maps.viridis;
    let fraction = scope.AtlasUtils.clamp((value - minimum) / (maximum - minimum), 0, 1);
    if(options&&scope.AtlasColorbar)fraction=scope.AtlasColorbar.fraction(fraction,options);
    const position = fraction * (stops.length - 1), index = Math.min(Math.floor(position), stops.length - 2);
    return scope.AtlasUtils.mix(stops[index], stops[index + 1], position - index);
  }
  function cleanMap(input, allowed) {
    const output = {};
    if (input && typeof input === "object") for (const key of allowed) {
      if (Object.hasOwn(input, key) && Number.isFinite(input[key])) output[key] = input[key];
    }
    return output;
  }
  function parseCSV(text, target, regions, parser) {
    const parsed = parser.parse(text.replace(/^\uFEFF/, ""), {header: true, skipEmptyLines: "greedy", transformHeader: header => header.trim().toLowerCase()});
    if (parsed.errors.some(problem => problem.type === "Quotes")) throw new Error("CSV 引号格式有误");
    const headers = parsed.meta.fields || [];
    if (target === "family" && ["region", "structure", "acronym", "label", "分区", "脑区"].some(header => headers.includes(header))) {
      throw new Error("这是脑区赋值文件，请先将赋值层级切换为脑区结构");
    }
    const keyHeader = (target === "family" ? ["family", "group", "分组"] : ["region", "structure", "acronym", "label", "分区", "脑区"]).find(header => headers.includes(header));
    const valueHeader = ["value", "score", "statistic", "数值", "值"].find(header => headers.includes(header));
    if (!keyHeader || !valueHeader) throw new Error(target === "family" ? "CSV 需要 family,value 两列" : "CSV 需要 region,value 两列");
    const keys = target === "family" ? [...new Set(regions.map(region => region.family).filter(Boolean))] : regions.map(region => region.id);
    const canonical = new Map(keys.map(key => [key.toLowerCase(), key]));
    if (target === "region") {
      const fullNames = new Map();
      regions.forEach(region => {
        if (!region.name) return;
        const name = region.name.toLowerCase();
        fullNames.set(name, fullNames.has(name) ? null : region.id);
      });
      for (const [name, key] of fullNames) if (key && !canonical.has(name)) canonical.set(name, key);
    }
    const patch = {}, unknown = [], invalid = [];
    let duplicates = 0;
    parsed.data.forEach((row, index) => {
      const rawKey = String(row[keyHeader] || "").trim(), key = canonical.get(rawKey.toLowerCase());
      if (!key) { if (rawKey) unknown.push(rawKey); return; }
      const rawValue = String(row[valueHeader] ?? "").trim();
      const missing = rawValue === "" || /^(na|nan|null)$/i.test(rawValue);
      if (!missing && (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(rawValue) || !Number.isFinite(Number(rawValue)))) {
        invalid.push({row: index + 2, region: key}); return;
      }
      if (Object.hasOwn(patch, key)) duplicates++;
      patch[key] = missing ? null : Number(rawValue);
    });
    return {patch, unknown, invalid, duplicates};
  }
  scope.AtlasValues = Object.freeze({maps,mapInfo,categorical,mountMapSelect,syncMapPreview,mountCategoricalSelect,resolvedValue, valueRange, valueColour, cleanMap, parseCSV});
})(typeof window === "undefined" ? globalThis : window);
