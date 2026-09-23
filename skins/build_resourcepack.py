#!/usr/bin/env python3
"""
把画好的皮肤打包成 Minecraft 资源包：替换**默认（离线）玩家皮肤**。

原理：离线玩家（我们的 bot `DeepSeekBot`）没有正版皮肤，客户端就回退到
  assets/minecraft/textures/entity/player/{wide,slim}/<九种默认皮肤>.png
这九个文件是普通材质，资源包可以直接覆盖 —— 于是机器人在**你的原版客户端**里
就会显示成鲸鱼娘，而你自己的账号（有正版皮肤）不受影响。

输出: skins/DeepSeek-whale-chan.zip，并复制到游戏 resourcepacks/ 目录。

用法: python3 skins/build_resourcepack.py
"""
import json
import shutil
import zipfile
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent
SKIN = OUT / 'deepseek-whale-chan.png'
BUILD = OUT / 'pack-build'
ZIP = OUT / 'DeepSeek-whale-chan.zip'
MCDIR = Path.home() / 'Library/Application Support/minecraft'
RP_DIR = MCDIR / 'resourcepacks'

NAMES = ['alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'steve', 'sunny', 'zuri']
MODELS = ['wide', 'slim']
PACK_FORMAT = 84          # 26.1 的 resource_major（取自 26.1.jar 里的 version.json）

assert SKIN.exists(), f'先跑 make_skin.py 生成 {SKIN}'

if BUILD.exists():
    shutil.rmtree(BUILD)

# ---- 1) 18 张默认皮肤全部指向同一张鲸鱼娘 ----
for model in MODELS:
    d = BUILD / 'assets/minecraft/textures/entity/player' / model
    d.mkdir(parents=True, exist_ok=True)
    for n in NAMES:
        shutil.copyfile(SKIN, d / f'{n}.png')

# ---- 2) pack.mcmeta ----
meta = {
    'pack': {
        'pack_format': PACK_FORMAT,
        'supported_formats': {'min_inclusive': PACK_FORMAT, 'max_inclusive': PACK_FORMAT},
        'description': 'DeepSeek 鲸鱼娘 · 默认玩家皮肤替换（画给 DeepSeekBot）',
    }
}
(BUILD / 'pack.mcmeta').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')

# ---- 3) pack.png 图标（头部特写）----
skin = Image.open(SKIN).convert('RGBA')
head = Image.new('RGBA', (8, 8), (0, 0, 0, 0))
head.paste(skin.crop((8, 8, 16, 16)), (0, 0))
head.alpha_composite(skin.crop((40, 8, 48, 16)))
icon = Image.new('RGBA', (128, 128), (222, 238, 252, 255))
big = head.resize((96, 96), Image.NEAREST)
icon.alpha_composite(big, (16, 16))
icon.save(BUILD / 'pack.png')

# ---- 4) 打包（pack.mcmeta 必须在 zip 根目录）----
if ZIP.exists():
    ZIP.unlink()
with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(BUILD.rglob('*')):
        if p.is_file():
            z.write(p, p.relative_to(BUILD).as_posix())
print('资源包:', ZIP)

# ---- 5) 装进游戏 resourcepacks/ ----
RP_DIR.mkdir(parents=True, exist_ok=True)
target = RP_DIR / ZIP.name
shutil.copyfile(ZIP, target)
print('已安装:', target)
print('清单:')
with zipfile.ZipFile(ZIP) as z:
    for n in z.namelist():
        print('  ', n)
