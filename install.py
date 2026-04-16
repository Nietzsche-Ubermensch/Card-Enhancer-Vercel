import launch

if not launch.is_installed("ultralytics"):
    launch.run_pip("install ultralytics==8.3.68", "ultralytics for Card Enhancer")

if not launch.is_installed("replicate"):
    launch.run_pip("install replicate==1.0.4", "replicate for Card Enhancer")

if not launch.is_installed("huggingface_hub"):
    launch.run_pip("install huggingface_hub==0.27.0", "huggingface_hub for Card Enhancer")

if not launch.is_installed("aiosqlite"):
    launch.run_pip("install aiosqlite==0.21.0", "aiosqlite for Card Enhancer")

if not launch.is_installed("sqlalchemy"):
    launch.run_pip("install sqlalchemy[asyncio]==2.0.41", "sqlalchemy for Card Enhancer")
