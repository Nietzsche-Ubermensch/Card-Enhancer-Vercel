import type { CropQuad, EnhancementSettings } from "@/lib/types";
import { telemetry } from "@/lib/telemetry";
import {
  FINAL_ENHANCEMENT_FRAGMENT,
  HIGH_PASS_SCRATCH_MASK_FRAGMENT,
  NAVIER_STOKES_INPAINT_FRAGMENT,
  PERSPECTIVE_WARP_FRAGMENT,
  VERTEX_SHADER_SOURCE,
} from "./shaders";

export class WebGLCardRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement;
  private maskProgram: WebGLProgram | null = null;
  private inpaintProgram: WebGLProgram | null = null;
  private enhanceProgram: WebGLProgram | null = null;
  private warpProgram: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private baseTexture: WebGLTexture | null = null;
  private maskFBO: WebGLFramebuffer | null = null;
  private maskTexture: WebGLTexture | null = null;
  private inpaintFBO: WebGLFramebuffer | null = null;
  private inpaintTexture: WebGLTexture | null = null;
  private currentImageWidth = 0;
  private currentImageHeight = 0;
  private isContextValid = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initWebGL();
  }

  get ready() {
    return this.isContextValid;
  }

  private initWebGL() {
    const startTime = performance.now();
    try {
      this.gl = this.canvas.getContext("webgl2", {
        preserveDrawingBuffer: true,
        alpha: true,
        premultipliedAlpha: false,
        antialias: true,
      });
      if (!this.gl) {
        telemetry.logError("WebGL 2.0 not supported", "WebGLRenderer");
        return;
      }
      const gl = this.gl;
      this.canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        this.isContextValid = false;
        telemetry.logWebglStateDrop();
      });
      this.canvas.addEventListener("webglcontextrestored", () => this.initWebGL());

      this.positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      this.texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
        gl.STATIC_DRAW,
      );
      this.maskProgram = this.createProgram(VERTEX_SHADER_SOURCE, HIGH_PASS_SCRATCH_MASK_FRAGMENT);
      this.inpaintProgram = this.createProgram(VERTEX_SHADER_SOURCE, NAVIER_STOKES_INPAINT_FRAGMENT);
      this.enhanceProgram = this.createProgram(VERTEX_SHADER_SOURCE, FINAL_ENHANCEMENT_FRAGMENT);
      this.warpProgram = this.createProgram(VERTEX_SHADER_SOURCE, PERSPECTIVE_WARP_FRAGMENT);
      this.isContextValid = !!(this.maskProgram && this.inpaintProgram && this.enhanceProgram && this.warpProgram);
      telemetry.logShaderCompileTime(performance.now() - startTime);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      telemetry.logError(`WebGL init failed: ${message}`, "WebGLRenderer");
      this.isContextValid = false;
    }
  }

  private createShader(gl: WebGL2RenderingContext, type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      telemetry.logError(`Shader compile failure: ${gl.getShaderInfoLog(shader)}`, "WebGLRenderer");
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private createProgram(vertSrc: string, fragSrc: string) {
    if (!this.gl) return null;
    const gl = this.gl;
    const vertShader = this.createShader(gl, gl.VERTEX_SHADER, vertSrc);
    const fragShader = this.createShader(gl, gl.FRAGMENT_SHADER, fragSrc);
    if (!vertShader || !fragShader) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      telemetry.logError(`Program link failure: ${gl.getProgramInfoLog(program)}`, "WebGLRenderer");
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  private createEmptyTexture(w: number, h: number) {
    if (!this.gl) return null;
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  private setupFramebuffers(w: number, h: number) {
    if (!this.gl) return;
    const gl = this.gl;
    if (this.currentImageWidth === w && this.currentImageHeight === h && this.maskFBO) return;
    this.currentImageWidth = w;
    this.currentImageHeight = h;
    if (this.maskTexture) gl.deleteTexture(this.maskTexture);
    if (this.maskFBO) gl.deleteFramebuffer(this.maskFBO);
    this.maskTexture = this.createEmptyTexture(w, h);
    this.maskFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.maskTexture, 0);
    if (this.inpaintTexture) gl.deleteTexture(this.inpaintTexture);
    if (this.inpaintFBO) gl.deleteFramebuffer(this.inpaintFBO);
    this.inpaintTexture = this.createEmptyTexture(w, h);
    this.inpaintFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.inpaintFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.inpaintTexture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private bindAttributes(program: WebGLProgram) {
    if (!this.gl) return;
    const gl = this.gl;
    const aPosLoc = gl.getAttribLocation(program, "aPosition");
    if (aPosLoc !== -1 && this.positionBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.enableVertexAttribArray(aPosLoc);
      gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
    }
    const aTexLoc = gl.getAttribLocation(program, "aTexCoord");
    if (aTexLoc !== -1 && this.texCoordBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.enableVertexAttribArray(aTexLoc);
      gl.vertexAttribPointer(aTexLoc, 2, gl.FLOAT, false, 0, 0);
    }
  }

  loadSourceImage(image: HTMLImageElement | HTMLCanvasElement) {
    if (!this.gl || !this.isContextValid) return;
    const gl = this.gl;
    const w = image.width || 1;
    const h = image.height || 1;
    this.setupFramebuffers(w, h);
    if (this.baseTexture) gl.deleteTexture(this.baseTexture);
    this.baseTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  render(settings: EnhancementSettings) {
    if (!this.gl || !this.isContextValid || !this.baseTexture) return;
    const gl = this.gl;
    const w = this.currentImageWidth;
    const h = this.currentImageHeight;
    if (w <= 0 || h <= 0) return;
    this.canvas.width = w;
    this.canvas.height = h;

    gl.bindFramebuffer(gl.FRAMEBUFFER, settings.descratchEnabled ? this.maskFBO : null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (settings.descratchEnabled && this.maskProgram) {
      gl.useProgram(this.maskProgram);
      this.bindAttributes(this.maskProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);
      gl.uniform1i(gl.getUniformLocation(this.maskProgram, "uTexture"), 0);
      gl.uniform2f(gl.getUniformLocation(this.maskProgram, "uTexelSize"), 1 / w, 1 / h);
      gl.uniform1f(gl.getUniformLocation(this.maskProgram, "uThreshold"), settings.descratchThreshold);
      gl.uniform1f(gl.getUniformLocation(this.maskProgram, "uRadius"), settings.descratchRadius);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, settings.descratchEnabled ? this.inpaintFBO : null);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (settings.descratchEnabled && this.inpaintProgram) {
      gl.useProgram(this.inpaintProgram);
      this.bindAttributes(this.inpaintProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.baseTexture);
      gl.uniform1i(gl.getUniformLocation(this.inpaintProgram, "uTexture"), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
      gl.uniform1i(gl.getUniformLocation(this.inpaintProgram, "uMaskTexture"), 1);
      gl.uniform2f(gl.getUniformLocation(this.inpaintProgram, "uTexelSize"), 1 / w, 1 / h);
      gl.uniform1f(gl.getUniformLocation(this.inpaintProgram, "uRadius"), settings.descratchRadius);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.enhanceProgram) {
      gl.useProgram(this.enhanceProgram);
      this.bindAttributes(this.enhanceProgram);
      const activeInputTex = settings.descratchEnabled ? this.inpaintTexture : this.baseTexture;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, activeInputTex);
      gl.uniform1i(gl.getUniformLocation(this.enhanceProgram, "uTexture"), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, settings.descratchEnabled ? this.maskTexture : this.baseTexture);
      gl.uniform1i(gl.getUniformLocation(this.enhanceProgram, "uMaskTexture"), 1);
      gl.uniform2f(gl.getUniformLocation(this.enhanceProgram, "uTexelSize"), 1 / w, 1 / h);
      gl.uniform1f(gl.getUniformLocation(this.enhanceProgram, "uBrightness"), settings.brightness);
      gl.uniform1f(gl.getUniformLocation(this.enhanceProgram, "uContrast"), settings.contrast);
      gl.uniform1f(gl.getUniformLocation(this.enhanceProgram, "uSaturation"), settings.saturation);
      gl.uniform1f(gl.getUniformLocation(this.enhanceProgram, "uVibrance"), settings.vibrance);
      gl.uniform1f(gl.getUniformLocation(this.enhanceProgram, "uSharpen"), settings.sharpen);
      gl.uniform1i(gl.getUniformLocation(this.enhanceProgram, "uShowScratchMask"), settings.showScratchMask ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  exportCroppedHighRes(
    image: HTMLImageElement | HTMLCanvasElement,
    quad: CropQuad,
    settings: EnhancementSettings,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();
      try {
        const origW = image.width || 1000;
        const origH = image.height || 1400;
        const offCanvas = document.createElement("canvas");
        const offRenderer = new WebGLCardRenderer(offCanvas);
        offRenderer.loadSourceImage(image);
        offRenderer.render(settings);

        const aspect = settings.aspectRatio ?? origW / origH;
        const outW = Math.min(1800, Math.max(800, Math.round(origW * 0.85)));
        const outH = Math.round(outW / aspect);
        const warped = warpPerspective(offCanvas, quad, outW, outH);

        warped.toBlob(
          (blob) => {
            telemetry.logWorkerTime(performance.now() - startTime);
            if (blob) resolve(URL.createObjectURL(blob));
            else resolve(warped.toDataURL("image/png"));
          },
          "image/png",
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        telemetry.logError(`High-res export failed: ${message}`, "ExportPipeline");
        reject(err);
      }
    });
  }

  exportBatchCard(
    image: HTMLImageElement | HTMLCanvasElement,
    quad: CropQuad,
    settings: EnhancementSettings,
    outW: number,
    outH: number,
    mime = "image/jpeg",
    quality = 0.9,
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.gl || !this.isContextValid || !this.warpProgram) {
        reject(new Error("WebGL renderer not ready"));
        return;
      }
      const startTime = performance.now();
      try {
        this.loadSourceImage(image);
        this.render(settings);
        const gl = this.gl;
        const srcTex = gl.createTexture();
        if (!srcTex) throw new Error("warp texture");
        gl.bindTexture(gl.TEXTURE_2D, srcTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        this.canvas.width = outW;
        this.canvas.height = outH;
        gl.viewport(0, 0, outW, outH);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(this.warpProgram);
        this.bindAttributes(this.warpProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, srcTex);
        gl.uniform1i(gl.getUniformLocation(this.warpProgram, "uTexture"), 0);
        gl.uniform2f(gl.getUniformLocation(this.warpProgram, "uTL"), quad.topLeft.x, quad.topLeft.y);
        gl.uniform2f(gl.getUniformLocation(this.warpProgram, "uTR"), quad.topRight.x, quad.topRight.y);
        gl.uniform2f(gl.getUniformLocation(this.warpProgram, "uBR"), quad.bottomRight.x, quad.bottomRight.y);
        gl.uniform2f(gl.getUniformLocation(this.warpProgram, "uBL"), quad.bottomLeft.x, quad.bottomLeft.y);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.deleteTexture(srcTex);

        this.canvas.toBlob(
          (blob) => {
            telemetry.logWorkerTime(performance.now() - startTime);
            if (blob) resolve(blob);
            else reject(new Error("encode failed"));
          },
          mime,
          quality,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        telemetry.logError(`Batch export failed: ${message}`, "ExportPipeline");
        reject(err);
      }
    });
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function warpPerspective(
  source: HTMLCanvasElement,
  quad: CropQuad,
  outW: number,
  outH: number,
): HTMLCanvasElement {
  const srcCtx = source.getContext("2d", { willReadFrequently: true });
  const dest = document.createElement("canvas");
  dest.width = outW;
  dest.height = outH;
  const destCtx = dest.getContext("2d");
  if (!srcCtx || !destCtx) return source;

  const srcW = source.width;
  const srcH = source.height;
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;
  const destImage = destCtx.createImageData(outW, outH);
  const destData = destImage.data;

  const tl = quad.topLeft;
  const tr = quad.topRight;
  const br = quad.bottomRight;
  const bl = quad.bottomLeft;

  for (let y = 0; y < outH; y++) {
    const v = y / (outH - 1 || 1);
    const leftX = lerp(tl.x, bl.x, v);
    const leftY = lerp(tl.y, bl.y, v);
    const rightX = lerp(tr.x, br.x, v);
    const rightY = lerp(tr.y, br.y, v);
    for (let x = 0; x < outW; x++) {
      const u = x / (outW - 1 || 1);
      const sx = (lerp(leftX, rightX, u) * (srcW - 1));
      const sy = (lerp(leftY, rightY, u) * (srcH - 1));
      const x0 = Math.max(0, Math.min(srcW - 2, Math.floor(sx)));
      const y0 = Math.max(0, Math.min(srcH - 2, Math.floor(sy)));
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x0 + 1) * 4;
      const i01 = ((y0 + 1) * srcW + x0) * 4;
      const i11 = ((y0 + 1) * srcW + x0 + 1) * 4;
      const di = (y * outW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v00 = srcData[i00 + c];
        const v10 = srcData[i10 + c];
        const v01 = srcData[i01 + c];
        const v11 = srcData[i11 + c];
        destData[di + c] = lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy);
      }
    }
  }
  destCtx.putImageData(destImage, 0, 0);
  return dest;
}
