"""Card Enhancer — Gradio Space.

Ports the Streamlit prototype enhancement pipeline so GitLab CI can
publish a live Hugging Face Space (Hub create_repo currently accepts
gradio | docker | static for new Spaces).
"""

from __future__ import annotations

import cv2
import gradio as gr
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


class BlemishDetector:
    def __init__(self, sensitivity: float = 0.7) -> None:
        self.sensitivity = sensitivity
        self.min_defect_size = int(10 + (1 - sensitivity) * 40)

    def detect_scratches(self, image: np.ndarray) -> list[tuple]:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        edges = cv2.Canny(enhanced, 50, 150)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        dilated = cv2.dilate(edges, kernel, iterations=1)
        lines = cv2.HoughLinesP(
            dilated,
            1,
            np.pi / 180,
            threshold=int(20 + (1 - self.sensitivity) * 30),
            minLineLength=int(30 + (1 - self.sensitivity) * 50),
            maxLineGap=10,
        )
        blemishes = []
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                length = float(np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2))
                if length > self.min_defect_size:
                    x, y = min(x1, x2), min(y1, y2)
                    w, h = abs(x2 - x1) + 5, abs(y2 - y1) + 5
                    confidence = min(1.0, length / 100) * self.sensitivity
                    blemishes.append(("scratch", confidence, (x, y, w, h)))
        return blemishes

    def detect_dust(self, image: np.ndarray) -> list[tuple]:
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        inverted = 255 - gray
        _, thresh = cv2.threshold(
            inverted, int(200 + self.sensitivity * 30), 255, cv2.THRESH_BINARY
        )
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        blemishes = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < self.min_defect_size or area > 500:
                continue
            x, y, w, h = cv2.boundingRect(contour)
            perimeter = cv2.arcLength(contour, True)
            if perimeter > 0:
                circularity = 4 * np.pi * area / (perimeter**2)
                if circularity > 0.5:
                    confidence = min(1.0, area / 100) * self.sensitivity
                    blemishes.append(("dust", confidence, (x, y, w, h)))
        return blemishes

    def detect_all(self, image: np.ndarray) -> list[tuple]:
        return self.detect_scratches(image) + self.detect_dust(image)


class ImageEnhancer:
    @staticmethod
    def remove_blemishes(image: np.ndarray, blemishes: list[tuple]) -> np.ndarray:
        if not blemishes:
            return image
        h, w = image.shape[:2]
        mask = np.zeros((h, w), dtype=np.uint8)
        for blemish in blemishes:
            _, _, (x, y, bw, bh) = blemish
            padding = 5
            x1, y1 = max(0, x - padding), max(0, y - padding)
            x2, y2 = min(w, x + bw + padding), min(h, y + bh + padding)
            cv2.rectangle(mask, (x1, y1), (x2, y2), 255, -1)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask = cv2.dilate(mask, kernel, iterations=1)
        return cv2.inpaint(image, mask, 3, cv2.INPAINT_TELEA)

    @staticmethod
    def sharpen(image: np.ndarray, amount: float) -> np.ndarray:
        pil_img = Image.fromarray(image)
        factor = 1 + amount
        kernel = np.array([[-1, -1, -1], [-1, factor + 8, -1], [-1, -1, -1]]) * (
            amount / 8
        )
        kernel[1, 1] = factor
        sharpened = pil_img.filter(
            ImageFilter.Kernel((3, 3), kernel.flatten(), scale=factor)
        )
        return np.array(sharpened)

    @staticmethod
    def adjust_color_temperature(image: np.ndarray, temperature: float) -> np.ndarray:
        pil_img = Image.fromarray(image)
        r, g, b = pil_img.split()
        r = r.point(lambda i: min(255, int(i * (1 + temperature * 0.1))))
        b = b.point(lambda i: min(255, int(i * (1 - temperature * 0.1))))
        return np.array(Image.merge("RGB", (r, g, b)))

    @staticmethod
    def adjust_saturation(image: np.ndarray, factor: float) -> np.ndarray:
        return np.array(ImageEnhance.Color(Image.fromarray(image)).enhance(factor))

    @staticmethod
    def adjust_contrast(image: np.ndarray, amount: float) -> np.ndarray:
        factor = 0.5 + amount
        return np.array(ImageEnhance.Contrast(Image.fromarray(image)).enhance(factor))

    @staticmethod
    def reduce_noise(image: np.ndarray, strength: float) -> np.ndarray:
        h = int(3 + strength * 7)
        h = h if h % 2 == 1 else h + 1
        return cv2.fastNlMeansDenoisingColored(image, None, h, h, 7, 21)

    @staticmethod
    def upscale(image: np.ndarray, factor: int) -> np.ndarray:
        h, w = image.shape[:2]
        return cv2.resize(image, (w * factor, h * factor), interpolation=cv2.INTER_LANCZOS4)


def enhance_image(
    image: np.ndarray,
    remove_blemishes: bool,
    sensitivity: float,
    sharpen_amt: float,
    temperature: float,
    saturation: float,
    contrast: float,
    denoise: float,
    upscale_factor: int,
) -> tuple[np.ndarray, str]:
    if image is None:
        raise gr.Error("Upload a card scan first.")
    if image.dtype != np.uint8:
        image = np.clip(image, 0, 255).astype(np.uint8)
    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    elif image.shape[2] == 4:
        image = image[:, :, :3]

    result = image.copy()
    notes: list[str] = []
    if remove_blemishes:
        detector = BlemishDetector(sensitivity=sensitivity)
        blemishes = detector.detect_all(result)
        result = ImageEnhancer.remove_blemishes(result, blemishes)
        notes.append(f"blemishes={len(blemishes)}")
    if sharpen_amt > 0:
        result = ImageEnhancer.sharpen(result, sharpen_amt)
        notes.append(f"sharpen={sharpen_amt:.2f}")
    if abs(temperature) > 0.01:
        result = ImageEnhancer.adjust_color_temperature(result, temperature)
        notes.append(f"temp={temperature:.2f}")
    if abs(saturation - 1.0) > 0.01:
        result = ImageEnhancer.adjust_saturation(result, saturation)
        notes.append(f"sat={saturation:.2f}")
    if abs(contrast - 0.5) > 0.01:
        result = ImageEnhancer.adjust_contrast(result, contrast)
        notes.append(f"contrast={contrast:.2f}")
    if denoise > 0:
        result = ImageEnhancer.reduce_noise(result, denoise)
        notes.append(f"denoise={denoise:.2f}")
    if upscale_factor > 1:
        result = ImageEnhancer.upscale(result, int(upscale_factor))
        notes.append(f"upscale={int(upscale_factor)}x")
    return result, " | ".join(notes) if notes else "no-op (identity)"


THEME = gr.themes.Base(
    primary_hue="cyan",
    secondary_hue="fuchsia",
    neutral_hue="zinc",
).set(
    body_background_fill="#050505",
    body_text_color="#e8e8e8",
    block_background_fill="#111111",
    block_border_color="#1f3a3a",
    button_primary_background_fill="#00c8c8",
    button_primary_text_color="#041010",
)

with gr.Blocks(title="Card Enhancer", theme=THEME) as demo:
    gr.Markdown(
        "# Card Enhancer\n"
        "Bulk sports-card scan cleanup: scratch/dust inpaint, sharpen, "
        "color, denoise, Lanczos upscale. Published from GitLab "
        "`rbeachg941/card-enhancer-vercel`."
    )
    with gr.Row():
        src = gr.Image(label="Scan", type="numpy")
        out = gr.Image(label="Enhanced", type="numpy")
    status = gr.Textbox(label="Pipeline", interactive=False)
    with gr.Row():
        remove = gr.Checkbox(label="Remove blemishes", value=True)
        sensitivity = gr.Slider(0.1, 1.0, value=0.7, step=0.05, label="Detector sensitivity")
        sharpen = gr.Slider(0.0, 2.0, value=0.4, step=0.05, label="Sharpen")
        temperature = gr.Slider(-1.0, 1.0, value=0.0, step=0.05, label="Temperature")
    with gr.Row():
        saturation = gr.Slider(0.0, 2.0, value=1.05, step=0.05, label="Saturation")
        contrast = gr.Slider(0.0, 1.5, value=0.6, step=0.05, label="Contrast")
        denoise = gr.Slider(0.0, 1.0, value=0.15, step=0.05, label="Denoise")
        upscale = gr.Slider(1, 4, value=1, step=1, label="Upscale")
    run = gr.Button("Enhance", variant="primary")
    run.click(
        enhance_image,
        inputs=[
            src,
            remove,
            sensitivity,
            sharpen,
            temperature,
            saturation,
            contrast,
            denoise,
            upscale,
        ],
        outputs=[out, status],
    )

if __name__ == "__main__":
    demo.launch()
