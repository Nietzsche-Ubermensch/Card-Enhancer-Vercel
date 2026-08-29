export async function fileToJpegBase64(file: File, maxDim = 1280): Promise<{ base64: string; mimeType: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return canvasToJpeg(img, maxDim);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function urlToJpegBase64(src: string, maxDim = 1280): Promise<{ base64: string; mimeType: string }> {
  const img = await loadImage(src);
  return canvasToJpeg(img, maxDim);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function canvasToJpeg(img: HTMLImageElement | HTMLCanvasElement, maxDim: number) {
  let width = img.width;
  let height = img.height;
  if (width > height && width > maxDim) {
    height = (height * maxDim) / width;
    width = maxDim;
  } else if (height > maxDim) {
    width = (width * maxDim) / height;
    height = maxDim;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.84);
  return { base64: dataUrl.split(",")[1] ?? "", mimeType: "image/jpeg" };
}
