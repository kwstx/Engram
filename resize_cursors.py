from PIL import Image
import os

files = ['website/cursor-auto.png', 'website/cursor-pointer.png']

for f in files:
    try:
        img = Image.open(f)
        # Use Nearest neighbor to preserve pixel art look if it is pixel art
        # However, 160->32 is 5x reduction.
        img.thumbnail((32, 32), Image.Resampling.LANCZOS)
        img.save(f)
        print(f"Resized {f} to {img.size}")
    except Exception as e:
        print(f"Error resizing {f}: {e}")
