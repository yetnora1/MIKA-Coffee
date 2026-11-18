from PIL import Image, ImageEnhance, ImageFilter, ImageOps
src = r"C:\Users\pc\AppData\Roaming\kimi-desktop\message-queue-assets\9144dd8c3982599bb8ae\df34b3647fc4e91cbf61\23ffa7ac3a4cef865970\c909daa1-4af5-4d34-996e-83c1e09a315f.png"
im = Image.open(src).convert("L")
regions = {
 "top_left":  (30, 190, 200, 350),
 "top_right": (190, 190, 360, 350),
 "mid_left":  (30, 355, 200, 520),
 "mid_right": (190, 355, 360, 520),
 "bot_left":  (30, 530, 200, 700),
 "bot_right": (190, 530, 360, 700),
 "title":     (60, 195, 320, 230),
}
for name,(a,b,c,d) in regions.items():
    c1 = im.crop((a,b,c,d))
    c1 = ImageOps.autocontrast(c1, cutoff=1)
    c1 = c1.resize((c1.width*5, c1.height*5), Image.LANCZOS)
    c1 = c1.filter(ImageFilter.UnsharpMask(radius=2, percent=180, threshold=1))
    c1 = ImageEnhance.Contrast(c1).enhance(1.6)
    c1.save(f"work/{name}.png")
print("done")
