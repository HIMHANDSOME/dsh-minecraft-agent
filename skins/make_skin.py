#!/usr/bin/env python3
"""
DeepSeek 鲸鱼娘 · Minecraft 皮肤生成器（64x64 现代格式，含外套层）

设计参考社区二创（DeepSeek-chan / 鲸鱼娘 / 蓝色大肥鱼）：
  · 亮蓝→青蓝渐变的及腰长发 + 头顶呆毛
  · 白色荷叶边女仆发箍 + 蓝色蝴蝶结
  · 头部两侧的鲸鱼胸鳍（"鲸耳"）
  · 藏青女仆裙 + 白色荷叶边围裙 + 领口宝石领结 + 围裙上的鲸尾标
  · 身后鲸尾
  · 白色泡泡袖 + 白色过膝袜 + 藏青鞋

输出:
  skins/deepseek-whale-chan.png      64x64 皮肤本体
  skins/preview-texture-10x.png      纹理放大图（自查用）
  skins/preview-doll-10x.png         纸娃娃 正/背/侧 视图（自查用）
  skins/preview-head-20x.png         头部特写（自查用）

用法: python3 skins/make_skin.py
"""
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parent
S = 64

# ---------------------------------------------------------------- 调色板
C = {
    '.': (0, 0, 0, 0),          # 透明（外套层镂空）
    'k': (16, 26, 56, 255),     # 最深描边 / 鞋
    'D': (27, 37, 71, 255),     # 藏青暗部
    'n': (50, 72, 158, 255),    # 头发暗部
    'm': (72, 106, 196, 255),   # 头发主色
    'b': (108, 156, 232, 255),  # 头发亮蓝
    'c': (140, 205, 240, 255),  # 发梢青
    'C': (190, 232, 250, 255),  # 发梢浅青
    'd': (35, 48, 90, 255),     # 女仆裙藏青
    'w': (245, 248, 253, 255),  # 白（围裙 / 荷叶边）
    'W': (211, 219, 234, 255),  # 白暗部（褶子）
    'f': (185, 196, 216, 255),  # 荷叶边描线
    's': (248, 216, 192, 255),  # 皮肤
    'S': (227, 183, 156, 255),  # 皮肤暗部
    'p': (240, 160, 166, 255),  # 腮红
    'e': (98, 180, 235, 255),   # 眼虹膜
    'E': (23, 34, 74, 255),     # 眼线 / 瞳孔
    'h': (255, 255, 255, 255),  # 高光
    'o': (142, 44, 62, 255),    # 口腔
    'g': (77, 107, 254, 255),   # DeepSeek 蓝（鲸标 / 宝石 / 蝴蝶结）
    'G': (143, 208, 255, 255),  # 亮蓝（宝石高光）
}

img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
px = img.load()


def blit(grid, x0, y0, name=''):
    for v, row in enumerate(grid):
        for u, ch in enumerate(row):
            if ch == ' ':
                continue
            if ch not in C:
                raise ValueError(f'{name}: 未知色号 {ch!r} at ({u},{v})')
            px[x0 + u, y0 + v] = C[ch]


def check(grid, w, h, name):
    assert len(grid) == h, f'{name}: 行数 {len(grid)} != {h}'
    for i, r in enumerate(grid):
        assert len(r) == w, f'{name}: 第 {i} 行宽度 {len(r)} != {w}（{r!r}）'


# ================================================================ 基础层
# 脸：左右各留 1px 鬓发，中间 6px 是脸；眼 = 上眼线 E + 虹膜 e + 高光 h
HEAD_FRONT = [
    'bbmmmmbb',
    'bmmbbmmb',
    'mmbssbmm',
    'nEEssEEn',
    'neesseen',
    'nspsspsn',
    'nssoossn',
    'nssssssn',
]
HEAD_SIDE = [
    'nnnnnnnn',
    'nmmnnmmn',
    'nmmnnmmn',
    'nnnnnnnn',
    'nnbbnnnn',
    'nnbbnnnn',
    'ccbbnnnn',
    'CCcbnnnn',
]
HEAD_BACK = [
    'nnnnnnnn',
    'nmmnnmmn',
    'nmmnnmmn',
    'nnnnnnnn',
    'nnnnnnnn',
    'nnnnnnnn',
    'cccccccc',
    'CCCCCCCC',
]
HEAD_TOP = [
    'nnnnnnnn',
    'nnbbbbnn',
    'nbbmmbbn',
    'nbmnnmbn',
    'nbmnnmbn',
    'nbbmmbbn',
    'nnbbbbnn',
    'nnnnnnnn',
]
HEAD_BOTTOM = [
    'ssssnnnn',
    'ssssnnnn',
    'ssSSnnnn',
    'ssSSnnnn',
    'ssSSnnnn',
    'ssSSnnnn',
    'SSSSnnnn',
    'SSSSnnnn',
]

# 身体打底层（可见的是夹克层；这里保持一致以防外套层被改）
BODY_FRONT = [
    'dddddddd',
    'dwwwwwwd',
    'dwdggdwd',
    'dwwwwwwd',
    'dwg..gwd',
    'dw.gg.wd',
    'dw.gg.wd',
    'dwwwwwwd',
    'dwwwwwwd',
    'dfwwwwfd',
    'dwwwwwwd',
    'dWWWWWWd',
]
BODY_BACK = [
    'mmmmmmmm',
    'mmmmmmmm',
    'bmmmmmmb',
    'cmmmmmmc',
    'ccmmmmcc',
    'dddddddd',
    'ddwwwwdd',
    'dddddddd',
    '...gg...',
    '..gggg..',
    '.gg..gg.',
    '.g....g.',
]
BODY_SIDE = [
    'mmmm',
    'mmmm',
    'bmmm',
    'cmmm',
    'dwwd',
    'dddd',
    'dddd',
    'dwwd',
    'dwwd',
    'dddd',
    'dwwd',
    'dWWd',
]

# 手臂：白泡泡袖 3 行 + 荷叶袖口 1 行 + 皮肤
ARM_FRONT = [
    'wwww',
    'wwww',
    'wwww',
    'WWWW',
    'ssss',
    'ssss',
    'ssss',
    'ssss',
    'ssss',
    'ssss',
    'ssss',
    'SSSS',
]
ARM_SIDE = [
    'wwww',
    'wwww',
    'wwww',
    'WWWW',
    'ssss',
    'ssss',
    'ssss',
    'ssss',
    'ssss',
    'ssss',
    'ssss',
    'SSSS',
]
ARM_BACK = ARM_SIDE

# 腿：裙摆 4 行藏青 + 白过膝袜 5 行 + 鞋 3 行
LEG_FRONT = [
    'dddd',
    'dddd',
    'dddd',
    'dddd',
    'wwww',
    'wwww',
    'wwww',
    'wwww',
    'wwww',
    'kkkk',
    'kkkk',
    'kkkk',
]
LEG_SIDE = [
    'dddd',
    'dddd',
    'dddd',
    'dddd',
    'wwww',
    'wwww',
    'WwwW',
    'wwww',
    'wwww',
    'kkkk',
    'kkkk',
    'kkkk',
]
LEG_BACK = LEG_SIDE

# ================================================================ 外套层
HAT_FRONT = [           # 白发箍 + 两侧各 1px 青色鬓发（不挡眼睛）
    'wwwwwwww',
    'WwWWWWwW',
    'cbnmmmbc',
    'm......m',
    'm......m',
    'b......b',
    'c......c',
    'C......C',
]
HAT_RIGHT = [           # 右侧：头发 + 鲸鳍（白，靠脸侧 u=7）
    'nnnnnnnn',
    'nnnmmnnn',
    'nnnmmnnn',
    'nnnnnnnw',
    'nnnnnnww',
    'nnnnnwww',
    'cnnnnwwc',
    'CcnnnCCc',
]
HAT_LEFT = [            # 左侧：头发 + 鲸鳍（靠脸侧 u=0）+ 蓝蝴蝶结
    'nnnnnnnn',
    'nnngggnn',
    'nnngggnn',
    'nnngggnn',
    'wnnnnmmn',
    'wwnnnmmn',
    'cwnnnnnn',
    'Ccnnnnnn',
]
HAT_BACK = [
    'nnnnnnnn',
    'nmmnnmmn',
    'nmmnnmmn',
    'nnnnnnnn',
    'nnnnnnnn',
    'nnnnnnnn',
    'cccccccc',
    'CCCCCCCC',
]
HAT_TOP = [             # 呆毛 + 发旋
    'nnnnnnnn',
    'nnnCCnnn',
    'nnCCCCnn',
    'nnnCCnnn',
    'nnbbbbnn',
    'nbbmmbbn',
    'nnbbbbnn',
    'nnnnnnnn',
]

JACKET_FRONT = [        # 藏青裙 + 白围裙 + 鲸尾标
    'dddddddd',
    'dwwwwwwd',   # 白色泡泡领
    'dwdggdwd',   # 领口宝石领结
    'dwwwwwwd',
    'dwg..gwd',   # 鲸尾（两片尾鳍）
    'dw.gg.wd',
    'dw.gg.wd',
    'dwwwwwwd',
    'dwwwwwwd',   # 围裙裙摆
    'dfwwwwfd',
    'dwwwwwwd',
    'dWWWWWWd',
]
JACKET_BACK = [         # 围裙系带 + 身后鲸尾
    'mmmmmmmm',
    'mmmmmmmm',
    'bmmmmmmb',
    'cmmmmmmc',
    'ccmmmmcc',
    'dddddddd',
    'ddwwwwdd',
    'dddddddd',
    '...gg...',
    '..gggg..',
    '.gg..gg.',
    '.g....g.',
]
JACKET_SIDE = [
    'mmmm',
    'mmmm',
    'bmmm',
    'cmmm',
    'dwwd',
    'dddd',
    'dddd',
    'dwwd',
    'dwwd',
    'dddd',
    'dwwd',
    'dWWd',
]

SLEEVE_FRONT = [        # 只留荷叶边（泡泡袖外沿）
    'wwww',
    'wWWw',
    'wwww',
    'wWWw',
    '....',
    '....',
    '....',
    '....',
    '....',
    '....',
    '....',
    '....',
]
SLEEVE_SIDE = SLEEVE_FRONT

PANT_FRONT = [          # 只留裙摆荷叶边
    '....',
    '....',
    'wwww',
    'wWWw',
    '....',
    '....',
    '....',
    '....',
    '....',
    '....',
    '....',
    '....',
]
PANT_SIDE = PANT_FRONT


def box(x0, y0, w, h, d, faces):
    if 'top' in faces:
        check(faces['top'], w, d, f'{x0},{y0} top'); blit(faces['top'], x0 + d, y0)
    if 'bottom' in faces:
        check(faces['bottom'], w, d, f'{x0},{y0} bottom'); blit(faces['bottom'], x0 + d + w, y0)
    for key, off, fw in (('right', 0, d), ('front', d, w), ('left', d + w, d), ('back', d + w + d, w)):
        if key in faces:
            check(faces[key], fw, h, f'{x0},{y0} {key}')
            blit(faces[key], x0 + off, y0 + d)


# 基础层
box(0, 0, 8, 8, 8, {'top': HEAD_TOP, 'bottom': HEAD_BOTTOM, 'right': HEAD_SIDE,
                    'front': HEAD_FRONT, 'left': HEAD_SIDE, 'back': HEAD_BACK})
box(16, 16, 8, 12, 4, {'top': ['dddddddd'] * 4, 'bottom': ['dddddddd'] * 4, 'right': BODY_SIDE,
                       'front': BODY_FRONT, 'left': BODY_SIDE, 'back': BODY_BACK})
box(40, 16, 4, 12, 4, {'top': ['wwww'] * 4, 'bottom': ['SSSS'] * 4, 'right': ARM_SIDE,
                       'front': ARM_FRONT, 'left': ARM_SIDE, 'back': ARM_BACK})
box(32, 48, 4, 12, 4, {'top': ['wwww'] * 4, 'bottom': ['SSSS'] * 4, 'right': ARM_SIDE,
                       'front': ARM_FRONT, 'left': ARM_SIDE, 'back': ARM_BACK})
box(0, 16, 4, 12, 4, {'top': ['dddd'] * 4, 'bottom': ['kkkk'] * 4, 'right': LEG_SIDE,
                      'front': LEG_FRONT, 'left': LEG_SIDE, 'back': LEG_BACK})
box(16, 48, 4, 12, 4, {'top': ['dddd'] * 4, 'bottom': ['kkkk'] * 4, 'right': LEG_SIDE,
                       'front': LEG_FRONT, 'left': LEG_SIDE, 'back': LEG_BACK})

# 外套层
box(32, 0, 8, 8, 8, {'top': HAT_TOP, 'right': HAT_RIGHT, 'front': HAT_FRONT,
                     'left': HAT_LEFT, 'back': HAT_BACK})
box(16, 32, 8, 12, 4, {'right': JACKET_SIDE, 'front': JACKET_FRONT,
                       'left': JACKET_SIDE, 'back': JACKET_BACK})
box(40, 32, 4, 12, 4, {'right': SLEEVE_SIDE, 'front': SLEEVE_FRONT,
                       'left': SLEEVE_SIDE, 'back': SLEEVE_FRONT})
box(48, 48, 4, 12, 4, {'right': SLEEVE_SIDE, 'front': SLEEVE_FRONT,
                       'left': SLEEVE_SIDE, 'back': SLEEVE_FRONT})
box(0, 32, 4, 12, 4, {'right': PANT_SIDE, 'front': PANT_FRONT,
                      'left': PANT_SIDE, 'back': PANT_FRONT})
box(0, 48, 4, 12, 4, {'right': PANT_SIDE, 'front': PANT_FRONT,
                      'left': PANT_SIDE, 'back': PANT_FRONT})

img.save(OUT / 'deepseek-whale-chan.png')
print('皮肤已写出:', (OUT / 'deepseek-whale-chan.png'))


# ================================================================ 预览
def zoom(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def part(x, y, w, h):
    return img.crop((x, y, x + w, y + h))


def layer(canvas, base, over, at):
    canvas.paste(base, at)
    canvas.alpha_composite(over, at)


def doll_front():
    cv = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    layer(cv, part(8, 8, 8, 8), part(40, 8, 8, 8), (4, 0))
    layer(cv, part(20, 20, 8, 12), part(20, 36, 8, 12), (4, 8))
    layer(cv, part(44, 20, 4, 12), part(44, 36, 4, 12), (0, 8))
    layer(cv, part(36, 52, 4, 12), part(52, 52, 4, 12), (12, 8))
    layer(cv, part(4, 20, 4, 12), part(4, 36, 4, 12), (4, 20))
    layer(cv, part(20, 52, 4, 12), part(4, 52, 4, 12), (8, 20))
    return cv


def doll_back():
    cv = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    layer(cv, part(24, 8, 8, 8), part(56, 8, 8, 8), (4, 0))
    layer(cv, part(32, 20, 8, 12), part(32, 36, 8, 12), (4, 8))
    layer(cv, part(52, 20, 4, 12), part(52, 36, 4, 12), (0, 8))
    layer(cv, part(44, 52, 4, 12), part(60, 52, 4, 12), (12, 8))
    layer(cv, part(12, 20, 4, 12), part(12, 36, 4, 12), (4, 20))
    layer(cv, part(28, 52, 4, 12), part(12, 52, 4, 12), (8, 20))
    return cv


def doll_side():
    cv = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
    layer(cv, part(0, 8, 8, 8), part(32, 8, 8, 8), (4, 0))
    layer(cv, part(16, 20, 4, 12), part(16, 36, 4, 12), (6, 8))
    layer(cv, part(40, 20, 4, 12), part(40, 36, 4, 12), (2, 8))
    layer(cv, part(0, 20, 4, 12), part(0, 36, 4, 12), (6, 20))
    return cv


zoom(img, 10).save(OUT / 'preview-texture-10x.png')
sheet = Image.new('RGBA', (16 * 3 + 4, 32), (255, 255, 255, 255))
for i, d in enumerate((doll_front(), doll_back(), doll_side())):
    sheet.alpha_composite(d, (i * 18, 0))
zoom(sheet, 10).save(OUT / 'preview-doll-10x.png')

head = Image.new('RGBA', (8, 8), (0, 0, 0, 0))
layer(head, part(8, 8, 8, 8), part(40, 8, 8, 8), (0, 0))
zoom(head, 24).save(OUT / 'preview-head-20x.png')
print('预览已写出: preview-texture-10x.png / preview-doll-10x.png / preview-head-20x.png')
