onUiUpdate(function () {
    const statusEl = document.getElementById("card_enhancer_status");
    if (!statusEl) return;

    const gallery = document.querySelector("#txt2img_gallery img, #img2img_gallery img");
    if (gallery) {
        statusEl.innerHTML = "✓ Done";
        statusEl.className = "success";
        setTimeout(() => {
            statusEl.innerHTML = "Ready";
            statusEl.className = "";
        }, 3000);
    }
});

