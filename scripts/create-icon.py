from PIL import Image, ImageDraw
from pathlib import Path

out = Path(__file__).resolve().parents[1] / 'build'
out.mkdir(exist_ok=True)
size = 1024
image = Image.new('RGBA', (size, size))
mask = Image.new('L', (size, size))
ImageDraw.Draw(mask).rounded_rectangle((0, 0, size-1, size-1), radius=270, fill=255)
gradient = Image.new('RGBA', (size, size))
pixels = gradient.load()
for y in range(size):
    for x in range(size):
        t = (x + y) / (2 * size)
        pixels[x, y] = (int(116-40*t), int(155-50*t), int(255-31*t), 255)
image.paste(gradient, (0, 0), mask)
draw = ImageDraw.Draw(image)
points = [(268, 516), (438, 682), (768, 325)]
draw.line(points, fill='white', width=92, joint='curve')
for x, y in points:
    draw.ellipse((x-46,y-46,x+46,y+46), fill='white')
draw.ellipse((704, 688, 809, 793), fill='#cbd9ff')
image.resize((256, 256), Image.Resampling.LANCZOS).save(out / 'icon.png')
image.save(out / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
