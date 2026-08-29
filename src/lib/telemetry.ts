import type { AppState, TelemetryError, TelemetryMetrics, TelemetryPayload } from "./types";

class TelemetrySystem {
  private static instance: TelemetrySystem;
  private metrics: TelemetryMetrics = {
    fps: 60,
    frameTimeMs: 16.6,
    edgeDetectTimeMs: 0,
    shaderCompileTimeMs: 0,
    workerProcessingTimeMs: 0,
    webglStateDrops: 0,
    lastKeystroke: "None",
    timestamp: new Date().toISOString(),
  };
  private errors: TelemetryError[] = [];
  private frameCount = 0;
  private lastFpsTime = typeof performance !== "undefined" ? performance.now() : 0;
  private auditCallback?: () => void;

  static getInstance() {
    if (!TelemetrySystem.instance) TelemetrySystem.instance = new TelemetrySystem();
    return TelemetrySystem.instance;
  }

  registerAuditCallback(cb: () => void) {
    this.auditCallback = cb;
  }

  triggerAudit() {
    this.auditCallback?.();
  }

  updateFrameTime(deltaMs: number) {
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 1000) {
      this.metrics.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
      this.frameCount = 0;
      this.lastFpsTime = now;
    }
    this.metrics.frameTimeMs = Math.round((this.metrics.frameTimeMs * 0.8 + deltaMs * 0.2) * 10) / 10;
    this.metrics.timestamp = new Date().toISOString();
  }

  logEdgeDetectLatency(timeMs: number) {
    this.metrics.edgeDetectTimeMs = Math.round(timeMs * 100) / 100;
  }

  logShaderCompileTime(timeMs: number) {
    this.metrics.shaderCompileTimeMs = Math.round(timeMs * 100) / 100;
  }

  logWorkerTime(timeMs: number) {
    this.metrics.workerProcessingTimeMs = Math.round(timeMs * 100) / 100;
  }

  logKeystroke(key: string) {
    this.metrics.lastKeystroke = key;
  }

  logWebglStateDrop() {
    this.metrics.webglStateDrops++;
    this.logError("WebGL context lost", "WebGLRenderer");
  }

  logError(message: string, source = "App") {
    this.errors.unshift({
      id: Math.random().toString(36).slice(2, 9),
      message,
      timestamp: new Date().toISOString(),
      source,
    });
    if (this.errors.length > 25) this.errors.pop();
  }

  getPayload(appState: AppState = "Idle", cardName = "None", resolution = "0x0"): TelemetryPayload {
    let webglVendor = "Hardware Accelerated";
    let webglRenderer = "WebGL 2.0";
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (gl) {
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        if (debugInfo) {
          webglVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || webglVendor;
          webglRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || webglRenderer;
        }
      }
    } catch {
      /* ignore */
    }
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    return {
      metrics: { ...this.metrics },
      errors: [...this.errors],
      appState,
      activeCardName: cardName,
      resolution,
      browserUserAgent: typeof navigator !== "undefined" ? navigator.userAgent : "Unknown",
      webglVendor,
      webglRenderer,
      memoryUsage: memory
        ? `${Math.round(memory.usedJSHeapSize / 1048576)} MB / ${Math.round(memory.jsHeapSizeLimit / 1048576)} MB`
        : "N/A",
    };
  }
}

export const telemetry = TelemetrySystem.getInstance();
