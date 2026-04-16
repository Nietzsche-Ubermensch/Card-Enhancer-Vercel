import modules.scripts as scripts
import gradio as gr
from modules import images
from modules.processing import process_images, Processed
from modules.shared import opts, state
from PIL import Image
import os
import sys

# Add the extension's app directory to sys.path to import internal modules
extension_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(extension_dir)

from app.services.enhancement_service import EnhancementService
from app.services.card_detector import is_available as yolo_available

class Script(scripts.Script):
    def title(self):
        return "Card Enhancer AI"

    def show(self, is_img2img):
        return scripts.AlwaysVisible

    def ui(self, is_img2img):
        with gr.Accordion("Card Enhancer AI", open=False):
            with gr.Row():
                enabled = gr.Checkbox(label="Enable Card Enhancer", value=False)
            
            with gr.Row():
                preset = gr.Dropdown(
                    label="Preset",
                    choices=["mint_card", "worn_card", "damaged_card", "web_ready", "print_ready"],
                    value="worn_card"
                )
            
            with gr.Row():
                auto_crop = gr.Checkbox(label="Auto Crop (YOLO11-OBB)", value=True)
                upscale_factor = gr.Slider(minimum=1, maximum=4, step=1, label="Upscale Factor", value=4)
            
            with gr.Row():
                format = gr.Radio(label="Output Format", choices=["png", "jpg", "webp"], value="png")
                quality = gr.Slider(minimum=1, maximum=100, step=1, label="Quality", value=95)

        return [enabled, preset, auto_crop, upscale_factor, format, quality]

    def postprocess(self, p, processed, enabled, preset, auto_crop, upscale_factor, format, quality):
        if not enabled:
            return

        svc = EnhancementService()
        enhanced_images = []

        for i in range(len(processed.images)):
            # Skip the grid image if it exists
            if i == 0 and len(processed.images) > 1 and opts.return_grid:
                continue

            img = processed.images[i]
            
            # Save temporary image for processing
            temp_input = f"temp_input_{i}.png"
            img.save(temp_input)
            
            opts_dict = {
                "preset": preset,
                "auto_crop": auto_crop,
                "upscale_factor": upscale_factor,
                "format": format,
                "quality": quality
            }
            
            try:
                enhanced_path = svc.enhance_image(temp_input, opts_dict, quality=quality)
                enhanced_img = Image.open(enhanced_path)
                processed.images[i] = enhanced_img
                
                # Cleanup
                if os.path.exists(temp_input):
                    os.remove(temp_input)
                if os.path.exists(enhanced_path):
                    os.remove(enhanced_path)
            except Exception as e:
                print(f"Card Enhancer failed for image {i}: {e}")

        return processed
