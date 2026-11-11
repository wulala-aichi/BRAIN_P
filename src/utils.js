(function (scope) {
  "use strict";
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  function rgb(hex) {
    const value = Number.parseInt(hex.replace("#", ""), 16);
    return [value >> 16 & 255, value >> 8 & 255, value & 255];
  }
  function mix(first, second, fraction) {
    const start = rgb(first), end = rgb(second);
    return "#" + start.map((channel, index) => Math.round(channel + (end[index] - channel) * fraction).toString(16).padStart(2, "0")).join("");
  }
  function networkColour(value) {
    if (value === null || !Number.isFinite(value)) return "#e0e3e4";
    const stops = [0, 0.15, 0.5, 1], colours = ["#e4e7e8", "#c3d9d6", "#72aaa8", "#0e5964"];
    const bounded = clamp(value, 0, 1);
    for (let index = 1; index < stops.length; index++) {
      if (bounded <= stops[index]) return mix(colours[index - 1], colours[index], (bounded - stops[index - 1]) / (stops[index] - stops[index - 1]));
    }
    return colours[colours.length - 1];
  }
  function grayColour(colour) {
    const channels = rgb(colour);
    const level = Math.round(0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]);
    return "#" + level.toString(16).padStart(2, "0").repeat(3);
  }
  function closestSlice(slices, position) {
    let closest = 0;
    slices.forEach((slice, index) => {
      if (Math.abs(slice.position - position) < Math.abs(slices[closest].position - position)) closest = index;
    });
    return closest;
  }
  function intervalSelection(slices,count,start,step){
    if(!Array.isArray(slices)||!slices.length||!Number.isInteger(count)||count<1||count>64)return{ok:false,error:'片层数必须在1–64之间'};
    if(!Number.isFinite(start)||!Number.isFinite(step)||step<=0)return{ok:false,error:'请输入有效起始坐标和正数取片间隔'};
    const low=slices[0].position,high=slices.at(-1).position;
    const browseStep=slices.slice(1).reduce((minimum,slice,index)=>Math.min(minimum,slice.position-slices[index].position),Infinity);
    if(step+1e-8<browseStep)return{ok:false,error:`取片间隔不能小于现有浏览分辨率 ${Number(browseStep.toFixed(6))} mm`};
    const end=start+(count-1)*step;
    if(start<low-1e-7||end>high+1e-7)return{ok:false,error:`请求 ${start.toFixed(3)}–${end.toFixed(3)} mm 超出图谱范围 ${low.toFixed(3)}–${high.toFixed(3)} mm；请调整起点、间隔或行列数`};
    const requested=Array.from({length:count},(_,index)=>start+step*index),indices=requested.map(value=>{
      let closest=0;
      // A half-step tie consistently chooses the lower coordinate, despite FP noise.
      for(let index=1;index<slices.length;index++)if(Math.abs(slices[index].position-value)<Math.abs(slices[closest].position-value)-1e-9)closest=index;
      return closest;
    });
    if(new Set(indices).size!==count)return{ok:false,error:'多个位置落在同一浏览片层，请增大取片间隔'};
    const positions=indices.map(index=>slices[index].position),actualSteps=positions.slice(1).map((value,index)=>value-positions[index]);
    return{ok:true,indices,requested,positions,maxSnapError:Math.max(...positions.map((value,index)=>Math.abs(value-requested[index]))),actualStepMin:actualSteps.length?Math.min(...actualSteps):null,actualStepMax:actualSteps.length?Math.max(...actualSteps):null};
  }
  function crc32(bytes) {
    let checksum = 0xffffffff;
    for (const byte of bytes) {
      checksum ^= byte;
      for (let bit = 0; bit < 8; bit++) checksum = checksum >>> 1 ^ (checksum & 1 ? 0xedb88320 : 0);
    }
    return (checksum ^ 0xffffffff) >>> 0;
  }
  function withPngDpi(input, dpi) {
    const bytes = new Uint8Array(input);
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((value, index) => bytes[index] === value)) throw new Error("Invalid PNG");
    const density = Math.round(dpi / 0.0254);
    const chunk = new Uint8Array(21), chunkView = new DataView(chunk.buffer);
    chunkView.setUint32(0, 9);
    chunk.set([112, 72, 89, 115], 4);
    chunkView.setUint32(8, density);
    chunkView.setUint32(12, density);
    chunk[16] = 1;
    chunkView.setUint32(17, crc32(chunk.subarray(4, 17)));
    const pieces = [bytes.subarray(0, 8)];
    let offset = 8, inserted = false;
    while (offset + 12 <= bytes.length) {
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
      const end = offset + length + 12;
      if (end > bytes.length) throw new Error("Incomplete PNG chunk");
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      if (type !== "pHYs") pieces.push(bytes.subarray(offset, end));
      if (type === "IHDR") { pieces.push(chunk); inserted = true; }
      offset = end;
      if (type === "IEND") break;
    }
    if (!inserted) throw new Error("Missing PNG header");
    const output = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
    let cursor = 0;
    pieces.forEach(piece => { output.set(piece, cursor); cursor += piece.length; });
    return output;
  }
  function paintCanvas(canvas,image,background=null){const context=canvas.getContext('2d');if(background){context.fillStyle=background;context.fillRect(0,0,canvas.width,canvas.height);}context.drawImage(image,0,0,canvas.width,canvas.height);return context;}
  scope.AtlasUtils = Object.freeze({clamp, mix, networkColour, grayColour, closestSlice, intervalSelection, crc32, withPngDpi,paintCanvas});
})(typeof window === "undefined" ? globalThis : window);
