#!/usr/bin/env python3
"""Draws an original 256x256 pack icon for a pack and writes it to BP/pack_icon.png and RP/pack_icon.png.
Usage: gen-icon.py <pack-folder> <weather|disaster|night>"""
import math, sys, os
from PIL import Image, ImageDraw

def gradient(top, bottom):
    im = Image.new("RGB", (256, 256))
    d = ImageDraw.Draw(im)
    for y in range(256):
        k = y / 255
        d.line([(0, y), (256, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * k) for i in range(3)))
    return im

def weather():
    im = gradient((70, 120, 190), (170, 205, 235)); d = ImageDraw.Draw(im)
    for cx, cy, r in [(100, 110, 42), (140, 95, 52), (182, 115, 38), (130, 125, 44)]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(245, 248, 252))
    d.rectangle([62, 118, 218, 160], fill=(245, 248, 252))
    for x in (85, 118, 151, 184):
        d.line([(x, 175), (x - 10, 215)], fill=(40, 90, 170), width=6)
    d.ellipse([196, 24, 236, 64], fill=(255, 214, 80))
    return im

def disaster():
    im = gradient((60, 24, 20), (190, 80, 30)); d = ImageDraw.Draw(im)
    d.polygon([(20, 236), (100, 100), (128, 90), (156, 100), (236, 236)], fill=(45, 38, 40))
    d.polygon([(100, 100), (112, 108), (128, 96), (144, 108), (156, 100), (128, 90)], fill=(255, 140, 30))
    for x, h in [(118, 70), (130, 90), (142, 60)]:
        d.line([(128, 92), (x, 92 - h)], fill=(255, 190, 60), width=5)
    d.line([(60, 236), (92, 190), (84, 170), (120, 140)], fill=(255, 120, 20), width=4)
    return im

def night():
    im = gradient((8, 10, 30), (30, 36, 70)); d = ImageDraw.Draw(im)
    d.ellipse([70, 50, 190, 170], fill=(236, 232, 205))
    d.ellipse([105, 38, 215, 160], fill=(14, 18, 44))
    import random; r = random.Random(7)
    for _ in range(28):
        x, y = r.randint(8, 248), r.randint(8, 200)
        if (x - 160) ** 2 + (y - 100) ** 2 > 60 ** 2: d.point([(x, y), (x + 1, y)], fill=(255, 255, 255))
    d.polygon([(0, 256), (0, 215), (40, 195), (80, 220), (130, 200), (190, 225), (256, 205), (256, 256)], fill=(6, 8, 14))
    return im

root, kind = sys.argv[1], sys.argv[2]
img = {"weather": weather, "disaster": disaster, "night": night}[kind]()
for part in ("BP", "RP"):
    img.save(os.path.join(root, part, "pack_icon.png"))
print("icons written for", root)
