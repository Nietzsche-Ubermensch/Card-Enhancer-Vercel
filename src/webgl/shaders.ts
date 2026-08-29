/**
 * WebGL Shaders for Card Enhancement & Descratching Pipeline
 * Includes:
 * 1. Standard Quad Vertex Shader
 * 2. High-Pass Anomaly & Scratch Mask Fragment Shader
 * 3. Navier-Stokes / Gradient Inpainting Fragment Shader
 * 4. Master Enhancement & Sharpening Shader
 */

export const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 aPosition;
in vec2 aTexCoord;

out vec2 vTexCoord;

void main() {
  vTexCoord = aTexCoord;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * 1. ANOMALY DETECTION & SURFACE INPAINTING MASK SHADER
 * High-pass spatial filter isolating fine line scratches, scuffs, and brightness spikes.
 * Outputs r=1.0 for scratch, r=0.0 for clean card surface.
 */
export const HIGH_PASS_SCRATCH_MASK_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vTexCoord;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform float uThreshold; // e.g. 0.15 to 0.35
uniform float uRadius;    // kernel sample radius

float getLuminance(vec3 rgb) {
  return dot(rgb, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec4 centerColor = texture(uTexture, vTexCoord);
  float centerLum = getLuminance(centerColor.rgb);

  // Gaussian / box blur approximation for low-frequency baseline
  float sumLum = 0.0;
  float totalWeight = 0.0;

  for (float y = -2.0; y <= 2.0; y += 1.0) {
    for (float x = -2.0; x <= 2.0; x += 1.0) {
      vec2 offset = vec2(x, y) * uTexelSize * uRadius;
      float sampleLum = getLuminance(texture(uTexture, vTexCoord + offset).rgb);
      float weight = 1.0 / (1.0 + length(vec2(x, y)));
      sumLum += sampleLum * weight;
      totalWeight += weight;
    }
  }

  float lowFreqLum = sumLum / totalWeight;

  // High-pass spatial difference (scratch intensity)
  float highPassDiff = abs(centerLum - lowFreqLum);

  // Narrow linear discontinuity check (gradient directional variance)
  vec2 dx = uTexelSize * vec2(1.5, 0.0);
  vec2 dy = uTexelSize * vec2(0.0, 1.5);
  
  float lx1 = getLuminance(texture(uTexture, vTexCoord + dx).rgb);
  float lx2 = getLuminance(texture(uTexture, vTexCoord - dx).rgb);
  float ly1 = getLuminance(texture(uTexture, vTexCoord + dy).rgb);
  float ly2 = getLuminance(texture(uTexture, vTexCoord - dy).rgb);

  float gradMag = sqrt(pow(lx1 - lx2, 2.0) + pow(ly1 - ly2, 2.0));

  // Binary mask logic: 1.0 if scratch spike detected, 0.0 if clean
  float isScratch = (highPassDiff > uThreshold && gradMag > (uThreshold * 0.7)) ? 1.0 : 0.0;

  fragColor = vec4(vec3(isScratch), 1.0);
}
`;

/**
 * 2. NAVIER-STOKES & GRADIENT INPAINTING SHADER
 * Fluid dynamics & gradient directed interpolation.
 * Heals scratch pixels (1.0 in mask) using surrounding clean neighbor pixels (0.0).
 */
export const NAVIER_STOKES_INPAINT_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vTexCoord;
out vec4 fragColor;

uniform sampler2D uTexture;     // Base Card Image
uniform sampler2D uMaskTexture; // Binary Scratch Mask
uniform vec2 uTexelSize;
uniform float uRadius;

float getLuminance(vec3 rgb) {
  return dot(rgb, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec4 baseColor = texture(uTexture, vTexCoord);
  float scratchVal = texture(uMaskTexture, vTexCoord).r;

  // If pixel is clean (0.0), preserve exact original texture & crispness
  if (scratchVal < 0.3) {
    fragColor = baseColor;
    return;
  }

  // Pixel is marked as scratch (1.0). Inpaint using gradient-directed Navier-Stokes fluid approximation
  vec4 accumulatedColor = vec4(0.0);
  float accumulatedWeight = 0.0001;

  // Estimate local image gradient direction perpendicular to edge
  vec2 dx = vec2(uTexelSize.x * 2.0, 0.0);
  vec2 dy = vec2(0.0, uTexelSize.y * 2.0);

  float lumR = getLuminance(texture(uTexture, vTexCoord + dx).rgb);
  float lumL = getLuminance(texture(uTexture, vTexCoord - dx).rgb);
  float lumT = getLuminance(texture(uTexture, vTexCoord + dy).rgb);
  float lumB = getLuminance(texture(uTexture, vTexCoord - dy).rgb);

  vec2 grad = vec2(lumR - lumL, lumT - lumB);
  // Tangent vector along isopote / edge contour
  vec2 tangent = vec2(-grad.y, grad.x);
  if (length(tangent) > 0.0001) {
    tangent = normalize(tangent);
  } else {
    tangent = vec2(1.0, 0.0);
  }

  // Sample surrounding uncorrupted pixels along and across flow
  int samples = int(clamp(uRadius * 2.0, 3.0, 11.0));
  for (int i = -5; i <= 5; i++) {
    for (int j = -5; j <= 5; j++) {
      if (i == 0 && j == 0) continue;

      vec2 offset = (tangent * float(i) + vec2(-tangent.y, tangent.x) * float(j)) * uTexelSize * uRadius;
      vec2 sampleUV = vTexCoord + offset;
      
      float sampleMask = texture(uMaskTexture, sampleUV).r;
      // Only interpolate from CLEAN pixels (mask < 0.5)
      if (sampleMask < 0.5) {
        vec4 sColor = texture(uTexture, sampleUV);
        float dist = length(vec2(float(i), float(j)));
        float weight = 1.0 / (dist * dist + 0.1);

        accumulatedColor += sColor * weight;
        accumulatedWeight += weight;
      }
    }
  }

  if (accumulatedWeight > 0.001) {
    fragColor = accumulatedColor / accumulatedWeight;
  } else {
    // Fallback simple bilateral mean
    fragColor = baseColor;
  }
}
`;

/**
 * 3. MASTER GPU ENHANCEMENT & SHARPENING SHADER
 * Performs high-precision color correction, unsharp masking, vibrance, contrast, and optional scratch debug mask overlay.
 */
export const FINAL_ENHANCEMENT_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vTexCoord;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform sampler2D uMaskTexture;
uniform vec2 uTexelSize;

// Color Controls
uniform float uBrightness;      // -1.0 to 1.0
uniform float uContrast;        // 0.2 to 2.0
uniform float uSaturation;      // 0.0 to 2.0
uniform float uVibrance;        // 0.0 to 1.0
uniform float uSharpen;         // 0.0 to 2.0
uniform bool uShowScratchMask;  // Glowing neon scratch mask overlay

float getLuminance(vec3 rgb) {
  return dot(rgb, vec3(0.299, 0.587, 0.114));
}

void main() {
  // 1. Unsharp Masking (Sharpen Kernel)
  vec4 center = texture(uTexture, vTexCoord);

  vec4 blur = vec4(0.0);
  blur += texture(uTexture, vTexCoord + vec2(-uTexelSize.x, 0.0));
  blur += texture(uTexture, vTexCoord + vec2(uTexelSize.x, 0.0));
  blur += texture(uTexture, vTexCoord + vec2(0.0, -uTexelSize.y));
  blur += texture(uTexture, vTexCoord + vec2(0.0, uTexelSize.y));
  blur *= 0.25;

  vec3 sharpenedRGB = center.rgb + (center.rgb - blur.rgb) * uSharpen;

  // 2. Brightness adjustment
  vec3 color = sharpenedRGB + vec3(uBrightness);

  // 3. Contrast adjustment
  color = (color - vec3(0.5)) * uContrast + vec3(0.5);

  // 4. Saturation adjustment
  float lum = getLuminance(color);
  color = mix(vec3(lum), color, uSaturation);

  // 5. Vibrance adjustment (smart saturation boosting dull colors)
  float maxChan = max(color.r, max(color.g, color.b));
  float minChan = min(color.r, min(color.g, color.b));
  float satAmt = (maxChan - minChan) / (maxChan + 0.001);
  float vibranceFactor = (1.0 - satAmt) * uVibrance;
  color = mix(color, vec3(maxChan), -vibranceFactor);

  // Clamp output range
  color = clamp(color, 0.0, 1.0);

  // Optional: Debug Scratch Mask Overlay (Glowing Neon Cyan/Magenta)
  if (uShowScratchMask) {
    float maskVal = texture(uMaskTexture, vTexCoord).r;
    if (maskVal > 0.4) {
      color = mix(color, vec4(0.0, 0.95, 1.0, 1.0).rgb, 0.75); // Neon Cyan glow on detected scratches
    }
  }

  fragColor = vec4(color, center.a);
}
`;

export const PERSPECTIVE_WARP_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vTexCoord;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform vec2 uTL;
uniform vec2 uTR;
uniform vec2 uBR;
uniform vec2 uBL;

void main() {
  float u = vTexCoord.x;
  float v = 1.0 - vTexCoord.y;
  vec2 left = mix(uTL, uBL, v);
  vec2 right = mix(uTR, uBR, v);
  vec2 src = mix(left, right, u);
  fragColor = texture(uTexture, src);
}
`;
