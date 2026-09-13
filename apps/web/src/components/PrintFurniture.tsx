import { useEffect, useRef } from "react";
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export function Barcode({
  seed = 101,
  width = 180,
  height = 24,
}: {
  seed?: number;
  width?: number;
  height?: number;
}) {
  const random = rng(seed),
    bars = [];
  let x = 0;
  while (x < width - 2) {
    const w = 1 + Math.floor(random() * 6);
    if (random() > 0.3)
      bars.push(
        <rect
          key={x}
          x={x}
          y={random() > 0.8 ? Math.floor(height * 0.3) : 0}
          width={w}
          height={height}
        />,
      );
    x += w + 1 + Math.floor(random() * 4);
  }
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <g fill="currentColor">{bars}</g>
    </svg>
  );
}
export function Dither({
  seed = 324,
  cols = 22,
  rows = 8,
}: {
  seed?: number;
  cols?: number;
  rows?: number;
}) {
  const random = rng(seed),
    dots = [];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      if (random() < (x / (cols - 1)) * 0.92 + 0.04)
        dots.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
  return (
    <svg
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <g fill="currentColor">{dots}</g>
    </svg>
  );
}
export function Spiral({ seed = 7 }: { seed?: number }) {
  const random = rng(seed),
    turns = 3.4 + random() * 1.6;
  let d = "M32,32";
  for (let i = 0; i < 150; i++) {
    const t = (i / 150) * turns * Math.PI * 2,
      r = 1.2 * Math.exp(0.26 * t) * 0.5;
    d += ` L${32 + Math.cos(t) * r},${32 + Math.sin(t) * r}`;
  }
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function Wedge({ seed = 104 }: { seed?: number }) {
  const random = rng(seed),
    marks = [];
  for (let c = 0; c < 4; c++) {
    marks.push(
      <rect
        key={"r" + c}
        x={c * 9}
        y="0"
        width="8"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth=".7"
      />,
    );
    for (let i = 0; i < 26; i++)
      if (random() < c * 0.34)
        marks.push(
          <rect
            key={`${c}-${i}`}
            x={c * 9 + 1 + Math.floor(random() * 6)}
            y={1 + Math.floor(random() * 14)}
            width="1.4"
            height="1.4"
            fill="currentColor"
          />,
        );
  }
  return (
    <svg viewBox="0 0 35 16" width="100%" height="100%" aria-hidden="true">
      {marks}
    </svg>
  );
}
export function ReferenceGlyphs() {
  return (
    <div className="reference-glyphs" aria-hidden="true">
      <div className="g1">
        <Spiral seed={21} />
      </div>
      <div className="g2">
        <Dither seed={87} cols={38} rows={10} />
      </div>
      <div className="g3">
        <Barcode seed={222} width={200} height={24} />
      </div>
    </div>
  );
}
export function BackgroundField() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const gl = cv.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
    });
    if (!gl) return;
    const vertex = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    const fragment = `precision mediump float;uniform vec2 u_res;uniform float u_t;uniform vec3 u_col;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.03;a*=.5;}return v;}
float b2(vec2 a){a=floor(a);return fract(a.x*.5+a.y*a.y*.75);}
float b4(vec2 a){return b2(a*.5)*.25+b2(a);}
float b8(vec2 a){return b4(a*.5)*.25+b2(a);}
void main(){vec2 uv=gl_FragCoord.xy/u_res;vec2 p=vec2(uv.x*(u_res.x/u_res.y),uv.y)*2.6;float n=fbm(p+vec2(u_t*.035,-u_t*.022));n=fbm(p+vec2(n*1.5,n*1.2)+vec2(0.,u_t*.012));float v=smoothstep(.24,.80,n);float d=step(b8(gl_FragCoord.xy),v);gl_FragColor=vec4(u_col*d,d);}`;
    const shader = (type: number, source: string) => {
      const value = gl.createShader(type)!;
      gl.shaderSource(value, source);
      gl.compileShader(value);
      return value;
    };
    const vs = shader(gl.VERTEX_SHADER, vertex),
      fs = shader(gl.FRAGMENT_SHADER, fragment),
      program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, "u_res"),
      time = gl.getUniformLocation(program, "u_t"),
      color = gl.getUniformLocation(program, "u_col");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0,
      active = true;
    const draw = (ms: number) => {
      if (!active) return;
      const width = Math.max(2, Math.floor(innerWidth * 0.5)),
        height = Math.max(2, Math.floor(innerHeight * 0.5));
      if (cv.width !== width || cv.height !== height) {
        cv.width = width;
        cv.height = height;
      }
      gl.viewport(0, 0, cv.width, cv.height);
      gl.uniform2f(resolution, cv.width, cv.height);
      gl.uniform3fv(
        color,
        document.documentElement.dataset.theme === "light"
          ? [0.07, 0.07, 0.1]
          : [0.91, 0.9, 0.88],
      );
      gl.uniform1f(time, reduced.matches ? 18 : ms * 0.001);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduced.matches && document.visibilityState === "visible")
        frameId = requestAnimationFrame(draw);
    };
    const restart = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(draw);
    };
    const observer = new MutationObserver(restart);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    window.addEventListener("resize", restart);
    document.addEventListener("visibilitychange", restart);
    reduced.addEventListener("change", restart);
    restart();
    return () => {
      active = false;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", restart);
      document.removeEventListener("visibilitychange", restart);
      reduced.removeEventListener("change", restart);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);
  return <canvas ref={canvas} className="reference-field" aria-hidden="true" />;
}
