"use client";

import { useEffect, useRef, type CSSProperties } from "react";

/**
 * Animated WebGL mesh gradient (the Stripe technique). Ported from the AlphaHub
 * marketing site, hardened for strict mode: no non-null assertions, no unchecked
 * indexing, and the GL context is keyed on values so a re-render does not rebuild it.
 * Reduced-motion visitors keep the static CSS gradient behind the canvas.
 */

type Props = {
  colors?: string[];
  amplitude?: number;
  density?: [number, number];
  angle?: number;
  seed?: number;
  className?: string;
  style?: CSSProperties;
};

const BLEND = `
vec3 blendNormal(vec3 base, vec3 blend) { return blend; }
vec3 blendNormal(vec3 base, vec3 blend, float opacity) {
  return (blendNormal(base, blend) * opacity + base * (1.0 - opacity));
}
`;

const NOISE = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const VERTEX_BODY = `
varying vec3 v_color;
void main() {
  float time = u_time * u_global.noiseSpeed;
  vec2 noiseCoord = resolution * uvNorm * u_global.noiseFreq;
  float tilt = resolution.y / 2.0 * uvNorm.y;
  float incline = resolution.x * uvNorm.x / 2.0 * u_vertDeform.incline;
  float offset = resolution.x / 2.0 * u_vertDeform.incline * mix(u_vertDeform.offsetBottom, u_vertDeform.offsetTop, uv.y);
  float noise = snoise(vec3(
    noiseCoord.x * u_vertDeform.noiseFreq.x + time * u_vertDeform.noiseFlow,
    noiseCoord.y * u_vertDeform.noiseFreq.y,
    time * u_vertDeform.noiseSpeed + u_vertDeform.noiseSeed
  )) * u_vertDeform.noiseAmp;
  noise *= 1.0 - pow(abs(uvNorm.y), 2.0);
  noise = max(0.0, noise);
  vec3 pos = vec3(position.x, position.y + tilt + incline + noise - offset, position.z);
  v_color = u_baseColor;
  for (int i = 0; i < u_waveLayers_length; i++) {
    WaveLayers layer = u_waveLayers[i];
    float n = smoothstep(layer.noiseFloor, layer.noiseCeil,
      snoise(vec3(
        noiseCoord.x * layer.noiseFreq.x + time * layer.noiseFlow,
        noiseCoord.y * layer.noiseFreq.y,
        time * layer.noiseSpeed + layer.noiseSeed
      )) / 2.0 + 0.5);
    v_color = blendNormal(v_color, layer.color, pow(n, 4.));
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FRAGMENT = `
varying vec3 v_color;
void main() { gl_FragColor = vec4(v_color, 1.0); }
`;

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function StripeGradient({
  colors = ["#0E0E12", "#D70015", "#1C1C24", "#FF6B5B"],
  amplitude = 320,
  density = [0.06, 0.16],
  angle = 0,
  seed = 5,
  className,
  style,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Primitive keys: a new array literal each render must not rebuild the GL context.
  const colorKey = colors.join(",");
  const [densityX, densityY] = density;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) return;

    const rgb = colorKey.split(",").map(hexToRgb);
    const base = rgb[0] ?? [0, 0, 0];
    const layers = rgb.slice(1).length > 0 ? rgb.slice(1) : [base];

    const common = `
      uniform mat4 projectionMatrix;
      uniform mat4 modelViewMatrix;
      uniform vec2 resolution;
    `;
    const vertexUniforms = `
      uniform float u_time;
      uniform struct Global { vec2 noiseFreq; float noiseSpeed; } u_global;
      uniform struct VertDeform {
        float incline; float offsetTop; float offsetBottom; vec2 noiseFreq;
        float noiseAmp; float noiseSpeed; float noiseFlow; float noiseSeed;
      } u_vertDeform;
      uniform vec3 u_baseColor;
      uniform struct WaveLayers {
        vec3 color; vec2 noiseFreq; float noiseSpeed; float noiseFlow;
        float noiseSeed; float noiseFloor; float noiseCeil;
      } u_waveLayers[${String(layers.length)}];
      const int u_waveLayers_length = ${String(layers.length)};
    `;
    const prefix = "precision highp float;\n";
    const vertexSource =
      prefix +
      "attribute vec4 position;\nattribute vec2 uv;\nattribute vec2 uvNorm;\n" +
      common +
      vertexUniforms +
      NOISE +
      BLEND +
      VERTEX_BODY;
    const fragmentSource = prefix + common + FRAGMENT;

    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = compile(gl.VERTEX_SHADER, vertexSource);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const posBuf = gl.createBuffer();
    const uvBuf = gl.createBuffer();
    const uvNormBuf = gl.createBuffer();
    const idxBuf = gl.createBuffer();
    if (!posBuf || !uvBuf || !uvNormBuf || !idxBuf) return;

    const aPos = gl.getAttribLocation(program, "position");
    const aUv = gl.getAttribLocation(program, "uv");
    const aUvNorm = gl.getAttribLocation(program, "uvNorm");
    const loc = (name: string) => gl.getUniformLocation(program, name);
    let indexCount = 0;

    const upload = (xSeg: number, ySeg: number, w: number, h: number) => {
      const verts = (xSeg + 1) * (ySeg + 1);
      const positions = new Float32Array(3 * verts);
      const uvs = new Float32Array(2 * verts);
      const uvNorms = new Float32Array(2 * verts);
      const indices = new Uint16Array(6 * xSeg * ySeg);
      for (let y = 0; y <= ySeg; y++) {
        for (let x = 0; x <= xSeg; x++) {
          const i = y * (xSeg + 1) + x;
          uvs[2 * i] = x / xSeg;
          uvs[2 * i + 1] = 1 - y / ySeg;
          uvNorms[2 * i] = (x / xSeg) * 2 - 1;
          uvNorms[2 * i + 1] = 1 - (y / ySeg) * 2;
          positions[3 * i] = -w / 2 + x * (w / xSeg);
          positions[3 * i + 2] = -(-h / 2 + y * (h / ySeg));
          if (x < xSeg && y < ySeg) {
            const s = 6 * (y * xSeg + x);
            indices.set([i, i + 1 + xSeg, i + 1, i + 1, i + 1 + xSeg, i + 2 + xSeg], s);
          }
        }
      }
      indexCount = indices.length;
      const bind = (buf: WebGLBuffer, data: Float32Array, attr: number, size: number) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(attr);
        gl.vertexAttribPointer(attr, size, gl.FLOAT, false, 0, 0);
      };
      bind(posBuf, positions, aPos, 3);
      bind(uvBuf, uvs, aUv, 2);
      bind(uvNormBuf, uvNorms, aUvNorm, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    };

    gl.uniformMatrix4fv(
      loc("modelViewMatrix"),
      false,
      new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    );
    gl.uniform2f(loc("u_global.noiseFreq"), 0.00014, 0.00029);
    gl.uniform1f(loc("u_global.noiseSpeed"), 0.000005);
    gl.uniform1f(loc("u_vertDeform.incline"), Math.tan(angle));
    gl.uniform1f(loc("u_vertDeform.offsetTop"), -0.5);
    gl.uniform1f(loc("u_vertDeform.offsetBottom"), -0.5);
    gl.uniform2f(loc("u_vertDeform.noiseFreq"), 3, 4);
    gl.uniform1f(loc("u_vertDeform.noiseAmp"), amplitude);
    gl.uniform1f(loc("u_vertDeform.noiseSpeed"), 10);
    gl.uniform1f(loc("u_vertDeform.noiseFlow"), 3);
    gl.uniform1f(loc("u_vertDeform.noiseSeed"), seed);
    gl.uniform3f(loc("u_baseColor"), base[0], base[1], base[2]);
    layers.forEach((c, i) => {
      const p = `u_waveLayers[${String(i)}]`;
      gl.uniform3f(loc(`${p}.color`), c[0], c[1], c[2]);
      gl.uniform2f(loc(`${p}.noiseFreq`), 2 + (i + 1) / rgb.length, 3 + (i + 1) / rgb.length);
      gl.uniform1f(loc(`${p}.noiseSpeed`), 11 + 0.3 * (i + 1));
      gl.uniform1f(loc(`${p}.noiseFlow`), 6.5 + 0.3 * (i + 1));
      gl.uniform1f(loc(`${p}.noiseSeed`), seed + 10 * (i + 1));
      gl.uniform1f(loc(`${p}.noiseFloor`), 0.1);
      gl.uniform1f(loc(`${p}.noiseCeil`), 0.63 + 0.07 * (i + 1));
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniformMatrix4fv(
        loc("projectionMatrix"),
        false,
        new Float32Array([
          2 / canvas.width,
          0,
          0,
          0,
          0,
          2 / canvas.height,
          0,
          0,
          0,
          0,
          2 / -4000,
          0,
          0,
          0,
          0,
          1,
        ]),
      );
      gl.uniform2f(loc("resolution"), canvas.width, canvas.height);
      upload(
        Math.max(1, Math.ceil(canvas.width * densityX)),
        Math.max(1, Math.ceil(canvas.height * densityY)),
        canvas.width,
        canvas.height,
      );
    };
    resize();

    let visible = true;
    let playing = document.visibilityState === "visible";
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    });
    io.observe(canvas);
    const onVisibility = () => {
      playing = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibility);

    const uTime = loc("u_time");
    let time = 1253106;
    let last = 0;
    let frame = 0;
    let raf = requestAnimationFrame(function tick(now: number) {
      raf = requestAnimationFrame(tick);
      frame++;
      // Half frame rate, and nothing at all when hidden or scrolled away.
      if (!playing || !visible || frame % 2 === 0) return;
      time += Math.min(now - last, 1000 / 15);
      last = now;
      gl.uniform1f(uTime, time);
      gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteBuffer(posBuf);
      gl.deleteBuffer(uvBuf);
      gl.deleteBuffer(uvNormBuf);
      gl.deleteBuffer(idxBuf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [colorKey, amplitude, densityX, densityY, angle, seed]);

  return (
    <canvas
      aria-hidden="true"
      className={className}
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        ...style,
      }}
    />
  );
}
