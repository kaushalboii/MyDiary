import type { DiaryBook } from "@/lib/types";
import { siteConfig } from "./site-config";

const serif = '"Newsreader Variable", "Iowan Old Style", Georgia, serif';
const sans = '"Inter Variable", Inter, Arial, sans-serif';

function seeded(seed: string) {
  let state = 2166136261;
  for (const char of seed) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 8,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }

  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((entry, index) => {
    ctx.fillText(entry, x, y + index * lineHeight);
  });
  return Math.min(lines.length, maxLines);
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  width = 4,
) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawMotif(
  ctx: CanvasRenderingContext2D,
  book: DiaryBook,
  width: number,
  height: number,
) {
  const random = seeded(book.id);
  ctx.save();
  ctx.strokeStyle = book.accent;
  ctx.fillStyle = book.accent;
  ctx.globalAlpha = 0.48;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (book.motif) {
    case "lattice": {
      const nodes: Array<[number, number]> = [];
      for (let i = 0; i < 24; i += 1) {
        nodes.push([
          110 + random() * (width - 220),
          380 + random() * (height - 560),
        ]);
      }
      ctx.globalAlpha = 0.38;
      nodes.forEach((point, i) => {
        nodes.slice(i + 1).forEach((other) => {
          const distance = Math.hypot(point[0] - other[0], point[1] - other[1]);
          if (distance < 240) strokeLine(ctx, [point, other], 3);
        });
      });
      ctx.globalAlpha = 0.9;
      nodes.forEach(([x, y], index) => {
        ctx.beginPath();
        ctx.arc(x, y, index % 5 === 0 ? 12 : 6, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case "corrosion": {
      ctx.globalAlpha = 0.55;
      for (let ring = 0; ring < 8; ring += 1) {
        ctx.beginPath();
        const cx = width * (0.34 + random() * 0.38);
        const cy = height * (0.38 + random() * 0.42);
        const radius = 40 + ring * 42 + random() * 22;
        for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.16) {
          const wobble = Math.sin(a * 5 + ring) * 8 + random() * 7;
          const x = cx + Math.cos(a) * (radius + wobble);
          const y = cy + Math.sin(a) * (radius + wobble);
          if (a === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      break;
    }
    case "efficiency": {
      ctx.globalAlpha = 0.72;
      for (let x = 140; x < width - 100; x += 150) {
        ctx.strokeRect(x, 450, 94, height - 690);
        for (let y = 520; y < height - 250; y += 130) {
          ctx.beginPath();
          ctx.arc(x + 47, y, 26, 0, Math.PI * 2);
          ctx.stroke();
          strokeLine(
            ctx,
            [
              [x + 10, y],
              [x + 84, y],
            ],
            3,
          );
        }
      }
      strokeLine(
        ctx,
        [
          [120, height - 315],
          [width - 120, 420],
        ],
        9,
      );
      break;
    }
    case "network": {
      ctx.globalAlpha = 0.66;
      const cols = 7;
      const rows = 9;
      for (let x = 0; x < cols; x += 1) {
        for (let y = 0; y < rows; y += 1) {
          const px = 130 + x * 126 + Math.sin(y) * 18;
          const py = 390 + y * 105;
          if (x < cols - 1) {
            strokeLine(
              ctx,
              [
                [px, py],
                [px + 126 + Math.sin(y + 1) * 18, py + 105],
              ],
              2.5,
            );
          }
          ctx.beginPath();
          ctx.arc(px, py, (x + y) % 5 === 0 ? 11 : 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "boom": {
      ctx.globalAlpha = 0.86;
      for (let i = 0; i < 9; i += 1) {
        ctx.beginPath();
        ctx.arc(width * 0.54, height * 0.63, 48 + i * 68, 0, Math.PI * 2);
        ctx.lineWidth = i % 3 === 0 ? 13 : 4;
        ctx.stroke();
      }
      break;
    }
    case "organization": {
      ctx.globalAlpha = 0.8;
      const levels = [1, 3, 5, 7];
      levels.forEach((count, level) => {
        const y = 470 + level * 240;
        for (let i = 0; i < count; i += 1) {
          const x = ((i + 1) * width) / (count + 1);
          roundedRect(ctx, x - 44, y - 32, 88, 64, 12);
          ctx.strokeStyle = book.ink;
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.strokeStyle = book.accent;
          if (level < levels.length - 1) {
            strokeLine(
              ctx,
              [
                [x, y + 32],
                [x, y + 128],
              ],
              3,
            );
          }
        }
      });
      break;
    }
    case "schematic": {
      ctx.globalAlpha = 0.72;
      for (let i = 0; i < 6; i += 1) {
        const y = 430 + i * 165;
        strokeLine(
          ctx,
          [
            [110, y],
            [300, y],
            [380, y + (i % 2 ? -72 : 72)],
            [610, y + (i % 2 ? -72 : 72)],
            [700, y],
            [width - 110, y],
          ],
          5,
        );
        [300, 700].forEach((x) => {
          ctx.beginPath();
          ctx.arc(x, y, 14, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      break;
    }
    case "flight": {
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.moveTo(70, height * 0.82);
      ctx.bezierCurveTo(
        width * 0.2,
        height * 0.56,
        width * 0.68,
        height * 0.62,
        width * 0.9,
        height * 0.36,
      );
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.save();
      ctx.translate(width * 0.87, height * 0.38);
      ctx.rotate(-0.62);
      ctx.beginPath();
      ctx.moveTo(-58, 0);
      ctx.lineTo(40, -26);
      ctx.lineTo(72, 0);
      ctx.lineTo(40, 26);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case "circuit": {
      ctx.globalAlpha = 0.82;
      for (let i = 0; i < 14; i += 1) {
        const y = 390 + i * 76;
        const mid = 250 + random() * 510;
        strokeLine(
          ctx,
          [
            [85, y],
            [mid, y],
            [mid, y + (random() > 0.5 ? 42 : -42)],
            [width - 80, y + (random() > 0.5 ? 42 : -42)],
          ],
          3,
        );
        ctx.beginPath();
        ctx.arc(mid, y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "orbit": {
      ctx.globalAlpha = 0.66;
      ctx.save();
      ctx.translate(width * 0.52, height * 0.64);
      for (let i = 0; i < 7; i += 1) {
        ctx.rotate(0.42);
        ctx.beginPath();
        ctx.ellipse(0, 0, 100 + i * 48, 36 + i * 20, 0, 0, Math.PI * 2);
        ctx.lineWidth = i === 3 ? 8 : 3;
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(width * 0.52, height * 0.64, 24, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "branches": {
      ctx.globalAlpha = 0.84;
      const root: [number, number] = [width / 2, height - 185];
      for (let level = 0; level < 5; level += 1) {
        const count = 2 ** level;
        for (let index = 0; index < count; index += 1) {
          const y = height - 240 - level * 180;
          const span = width * (0.13 + level * 0.1);
          const x =
            width / 2 + (index / Math.max(1, count - 1) - 0.5) * span * 2;
          const parentIndex = Math.floor(index / 2);
          const parentCount = 2 ** Math.max(0, level - 1);
          const parentX =
            level === 0
              ? root[0]
              : width / 2 +
                (parentIndex / Math.max(1, parentCount - 1) - 0.5) *
                  width *
                  (0.13 + (level - 1) * 0.1) *
                  2;
          const parentY = level === 0 ? root[1] : y + 180;
          strokeLine(
            ctx,
            [
              [parentX, parentY],
              [x, y],
            ],
            4,
          );
          ctx.beginPath();
          ctx.arc(x, y, level === 4 ? 10 : 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "wave": {
      ctx.globalAlpha = 0.8;
      for (let row = 0; row < 10; row += 1) {
        ctx.beginPath();
        for (let x = 80; x <= width - 80; x += 12) {
          const y =
            430 +
            row * 92 +
            Math.sin(x * 0.025 + row * 0.78) * (18 + row * 3);
          if (x === 80) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineWidth = row % 3 === 0 ? 7 : 3;
        ctx.stroke();
      }
      break;
    }
    case "runner": {
      ctx.globalAlpha = 0.82;
      for (let frame = 0; frame < 7; frame += 1) {
        const x = 150 + frame * 122;
        const y = 760 + Math.sin(frame * 0.8) * 42;
        ctx.beginPath();
        ctx.arc(x, y - 125, 22, 0, Math.PI * 2);
        ctx.fill();
        strokeLine(
          ctx,
          [
            [x, y - 98],
            [x + 4, y - 28],
            [x - 38 + frame * 4, y + 42],
          ],
          9,
        );
        strokeLine(
          ctx,
          [
            [x + 2, y - 70],
            [x + 52, y - 42],
          ],
          8,
        );
        strokeLine(
          ctx,
          [
            [x + 4, y - 28],
            [x + 48, y + 28],
          ],
          9,
        );
      }
      break;
    }
    case "gather": {
      ctx.globalAlpha = 0.76;
      const colors = [book.ink, book.accent, "#2b5f83"];
      for (let i = 0; i < 18; i += 1) {
        ctx.strokeStyle = colors[i % colors.length];
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.arc(
          width * (0.2 + random() * 0.6),
          height * (0.34 + random() * 0.48),
          42 + random() * 110,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
      break;
    }
    case "maze": {
      ctx.globalAlpha = 0.76;
      const size = 94;
      for (let x = 92; x < width - 92; x += size) {
        for (let y = 400; y < height - 180; y += size) {
          const open = random() > 0.48;
          strokeLine(
            ctx,
            open
              ? [
                  [x, y],
                  [x + size, y],
                ]
              : [
                  [x, y],
                  [x, y + size],
                ],
            7,
          );
        }
      }
      ctx.strokeStyle = book.accent;
      strokeLine(
        ctx,
        [
          [95, height - 215],
          [310, height - 215],
          [310, 680],
          [720, 680],
          [720, 430],
          [width - 95, 430],
        ],
        14,
      );
      break;
    }
    case "fracture": {
      ctx.globalAlpha = 0.88;
      for (let i = 0; i < 16; i += 1) {
        const startX = width * 0.5 + (random() - 0.5) * 160;
        const startY = height * 0.62 + (random() - 0.5) * 140;
        const endX = random() > 0.5 ? width - 50 : 50;
        const endY = 340 + random() * (height - 500);
        strokeLine(
          ctx,
          [
            [startX, startY],
            [
              (startX + endX) / 2 + (random() - 0.5) * 90,
              (startY + endY) / 2,
            ],
            [endX, endY],
          ],
          i % 4 === 0 ? 12 : 4,
        );
      }
      break;
    }
    case "continuum": {
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      ctx.moveTo(70, height * 0.72);
      for (let x = 70; x <= width - 70; x += 16) {
        const t = (x - 70) / (width - 140);
        const y =
          height * 0.72 -
          Math.sin(t * Math.PI * 5) * 90 -
          Math.pow(t, 2) * 330;
        ctx.lineTo(x, y);
      }
      ctx.lineWidth = 12;
      ctx.stroke();
      break;
    }
    case "windows": {
      ctx.globalAlpha = 0.72;
      for (let i = 0; i < 9; i += 1) {
        const inset = 90 + i * 48;
        ctx.strokeRect(
          inset,
          390 + i * 32,
          width - inset * 2,
          height - 590 - i * 64,
        );
        ctx.lineWidth = i === 0 ? 11 : 4;
        ctx.stroke();
      }
      roundedRect(ctx, width * 0.49, height * 0.62, 24, 118, 8);
      ctx.fill();
      break;
    }
    case "steps": {
      ctx.globalAlpha = 0.86;
      for (let i = 0; i < 8; i += 1) {
        ctx.fillRect(120 + i * 92, height - 230 - i * 102, 78, 102 + i * 102);
      }
      ctx.globalAlpha = 0.34;
      strokeLine(
        ctx,
        [
          [110, height - 235],
          [width - 115, 420],
        ],
        8,
      );
      break;
    }
  }
  ctx.restore();
}

function addPaperGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: string,
) {
  const random = seeded(`${seed}-grain`);
  ctx.save();
  for (let i = 0; i < 1200; i += 1) {
    const alpha = 0.012 + random() * 0.02;
    ctx.fillStyle =
      random() > 0.5
        ? `rgba(255,255,255,${alpha})`
        : `rgba(40,32,24,${alpha})`;
    const size = random() * 2 + 0.35;
    ctx.fillRect(random() * width, random() * height, size, size);
  }
  ctx.restore();
}

function drawFittedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  dx: number,
  dy: number,
  dWidth: number,
  dHeight: number,
) {
  const imgW = image.naturalWidth || image.width;
  const imgH = image.naturalHeight || image.height;
  if (!imgW || !imgH) return;
  const targetRatio = dWidth / dHeight;
  const imgRatio = imgW / imgH;
  let sx = 0;
  let sy = 0;
  let sw = imgW;
  let sh = imgH;
  if (imgRatio > targetRatio) {
    sw = imgH * targetRatio;
    sx = (imgW - sw) * 0.5;
  } else {
    sh = imgW / targetRatio;
    sy = (imgH - sh) * 0.5;
  }
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dWidth, dHeight);
}

function contrastInkForHex(hex: string): string {
  const clean = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return "#2e2a25";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.62 ? "#2e2a25" : "#f9f6ef";
}

function drawCoverTypography(
  ctx: CanvasRenderingContext2D,
  book: DiaryBook,
  width: number,
  height: number,
  decalOnly = false,
  centered = false,
  footerColor?: string,
) {
  const imprint =
    book.coverImprint !== undefined ? book.coverImprint : siteConfig.coverImprint;
  const customFooter =
    book.coverFooter !== undefined ? book.coverFooter.trim() : "";

  ctx.save();
  ctx.fillStyle = book.ink;
  ctx.textBaseline = "top";
  if (centered) {
    ctx.textAlign = "center";
  }

  const textX = centered ? width * 0.5 : 82;
  const titleX = centered ? width * 0.5 : 78;

  if (imprint) {
    ctx.letterSpacing = "7px";
    ctx.font = `600 24px ${sans}`;
    ctx.fillText(imprint, textX, centered ? 210 : 74);
  }

  ctx.letterSpacing = "0px";
  const titleSize =
    book.title.length > 34 ? 72 : book.title.length > 20 ? 86 : 104;
  ctx.font = `520 ${titleSize}px ${serif}`;
  const titleY = centered ? 310 : imprint ? 142 : 96;

  let titleLines = 1;
  if (centered) {
    const words = book.title.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > width - 200 && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    const clipped = lines.slice(0, 4);
    clipped.forEach((entry, idx) => {
      ctx.fillText(entry, titleX, titleY + idx * titleSize * 0.96);
    });
    titleLines = clipped.length;
  } else {
    titleLines = wrapText(
      ctx,
      book.title,
      titleX,
      titleY,
      width - 156,
      titleSize * 0.92,
      5,
    );
  }

  if (book.subtitle) {
    ctx.font = `520 30px ${sans}`;
    ctx.letterSpacing = "0.2px";
    ctx.fillText(
      book.subtitle,
      textX,
      Math.max(
        centered ? titleY + titleLines * titleSize * 0.96 + 38 : 320,
        titleY + titleLines * titleSize * 0.96 + 34,
      ),
    );
  }

  if (!decalOnly) {
    ctx.fillStyle = footerColor || book.ink;
    ctx.globalAlpha = 0.72;
    ctx.font = `500 20px ${sans}`;
    ctx.letterSpacing = "3px";
    const fallbackFooter =
      book.coverTemplate === "clean-minimal" ? "" : siteConfig.coverTagline;
    const footerLabel = customFooter
      ? customFooter
      : book.memoryCount && book.memoryCount > 0
        ? `${book.memoryCount} ${book.memoryCount === 1 ? "MEMORY" : "MEMORIES"} · ${book.photoCount || 0} PHOTOS`
        : fallbackFooter;
    if (footerLabel) {
      ctx.fillText(footerLabel, textX, height - 92);
    }
  }
  ctx.restore();
}

export function createFrontCover(
  book: DiaryBook,
  customCoverImg?: HTMLImageElement | null,
) {
  const logicalWidth = 1024;
  const logicalHeight = 1536;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(0.5, 0.5);

  const template = book.coverTemplate || (customCoverImg ? "photo-card" : "classic");
  const showText = book.showCoverTextWithImage ?? true;

  // Base cloth background
  ctx.fillStyle = book.cover;
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  if (template === "photo-card" && customCoverImg) {
    drawFittedImage(ctx, customCoverImg, 0, 0, logicalWidth, logicalHeight);
    if (showText) {
      const grad = ctx.createLinearGradient(0, 0, 0, logicalHeight * 0.58);
      grad.addColorStop(0, "rgba(20, 17, 14, 0.72)");
      grad.addColorStop(1, "rgba(20, 17, 14, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, logicalWidth, logicalHeight * 0.62);

      const btmGrad = ctx.createLinearGradient(0, logicalHeight * 0.76, 0, logicalHeight);
      btmGrad.addColorStop(0, "rgba(20, 17, 14, 0)");
      btmGrad.addColorStop(1, "rgba(20, 17, 14, 0.65)");
      ctx.fillStyle = btmGrad;
      ctx.fillRect(0, logicalHeight * 0.76, logicalWidth, logicalHeight * 0.24);
    }
    addPaperGrain(ctx, logicalWidth, logicalHeight, book.id);
    if (showText) {
      drawCoverTypography(ctx, book, logicalWidth, logicalHeight, false, false);
    }
    return canvas;
  }

  if (template === "classic") {
    const secondary = book.secondary || book.accent;
    drawMotif(ctx, book, logicalWidth, logicalHeight);
    addPaperGrain(ctx, logicalWidth, logicalHeight, book.id);
    if (customCoverImg) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(140, 560, logicalWidth - 280, 680, 12);
      ctx.clip();
      drawFittedImage(ctx, customCoverImg, 140, 560, logicalWidth - 280, 680);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = book.accent;
      ctx.lineWidth = 6;
      roundedRect(ctx, 140, 560, logicalWidth - 280, 680, 12);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 4;
    ctx.strokeRect(22, 22, logicalWidth - 44, logicalHeight - 44);
    ctx.restore();
    drawCoverTypography(ctx, book, logicalWidth, logicalHeight, false, false);
    return canvas;
  }

  if (template === "clean-minimal") {
    const secondary = book.secondary || book.ink;
    addPaperGrain(ctx, logicalWidth, logicalHeight, book.id);
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 3;
    roundedRect(ctx, 56, 56, logicalWidth - 112, logicalHeight - 112, 12);
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = book.accent;
    ctx.lineWidth = 3;
    roundedRect(ctx, 74, 74, logicalWidth - 148, logicalHeight - 148, 8);
    ctx.stroke();
    ctx.restore();

    if (customCoverImg) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(212, 680, 600, 440, 14);
      ctx.clip();
      drawFittedImage(ctx, customCoverImg, 212, 680, 600, 440);
      ctx.restore();
    } else {
      ctx.save();
      ctx.strokeStyle = book.accent;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(logicalWidth * 0.5 - 64, 860);
      ctx.lineTo(logicalWidth * 0.5 + 64, 860);
      ctx.stroke();
      ctx.translate(logicalWidth * 0.5, 924);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = book.accent;
      ctx.fillRect(-10, -10, 20, 20);
      ctx.restore();
    }

    drawCoverTypography(ctx, book, logicalWidth, logicalHeight, false, true);
    return canvas;
  }

  if (template === "bordered-plaque") {
    const plaqueBg = book.secondary || "#faf7f0";
    const plaqueInk = contrastInkForHex(plaqueBg);
    addPaperGrain(ctx, logicalWidth, logicalHeight, book.id);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = book.accent;
    ctx.lineWidth = 5;
    roundedRect(ctx, 48, 48, logicalWidth - 96, logicalHeight - 96, 14);
    ctx.stroke();
    ctx.restore();

    const plaqueX = 118;
    const plaqueY = customCoverImg ? 180 : 340;
    const plaqueW = logicalWidth - 236;
    const plaqueH = customCoverImg ? 510 : 620;

    ctx.save();
    ctx.fillStyle = plaqueBg;
    roundedRect(ctx, plaqueX, plaqueY, plaqueW, plaqueH, 16);
    ctx.fill();
    ctx.strokeStyle = book.accent;
    ctx.globalAlpha = 0.92;
    ctx.lineWidth = 4.5;
    roundedRect(ctx, plaqueX + 18, plaqueY + 18, plaqueW - 36, plaqueH - 36, 10);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = plaqueInk;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const imprint =
      book.coverImprint !== undefined ? book.coverImprint : siteConfig.coverImprint;
    if (imprint) {
      ctx.font = `600 22px ${sans}`;
      ctx.letterSpacing = "6px";
      ctx.fillText(imprint, logicalWidth * 0.5, plaqueY + 66);
    }
    ctx.letterSpacing = "0px";
    const titleSize = book.title.length > 26 ? 68 : 88;
    ctx.font = `520 ${titleSize}px ${serif}`;
    const words = book.title.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > plaqueW - 110 && line) {
        lines.push(line);
        line = w;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    const startY = plaqueY + (imprint ? 150 : 120);
    lines.slice(0, 4).forEach((entry, idx) => {
      ctx.fillText(entry, logicalWidth * 0.5, startY + idx * titleSize * 0.96);
    });
    if (book.subtitle) {
      ctx.globalAlpha = 0.78;
      ctx.font = `500 28px ${sans}`;
      ctx.fillText(
        book.subtitle,
        logicalWidth * 0.5,
        startY + Math.min(lines.length, 4) * titleSize * 0.96 + 30,
      );
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (customCoverImg) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(plaqueX, plaqueY + plaqueH + 54, plaqueW, 560, 10);
      ctx.clip();
      drawFittedImage(ctx, customCoverImg, plaqueX, plaqueY + plaqueH + 54, plaqueW, 560);
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = book.ink;
    ctx.globalAlpha = 0.76;
    ctx.font = `500 20px ${sans}`;
    ctx.letterSpacing = "3px";
    ctx.textAlign = "center";
    const footer =
      book.coverFooter?.trim() ||
      (book.memoryCount && book.memoryCount > 0
        ? `${book.memoryCount} ${book.memoryCount === 1 ? "MEMORY" : "MEMORIES"}`
        : "");
    if (footer) {
      ctx.fillText(footer, logicalWidth * 0.5, logicalHeight - 92);
    }
    ctx.restore();
    return canvas;
  }

  // "split-band": two-tone lower horizontal cloth/secondary band + crisp vibrant seam
  addPaperGrain(ctx, logicalWidth, logicalHeight, book.id);
  const bandTop = Math.round(logicalHeight * 0.58);
  const bandColor = book.secondary || book.accent;
  const bandInk = contrastInkForHex(bandColor);
  ctx.save();
  ctx.fillStyle = bandColor;
  ctx.fillRect(0, bandTop, logicalWidth, logicalHeight - bandTop);
  ctx.fillStyle = book.accent;
  ctx.fillRect(0, bandTop - 7, logicalWidth, 14);
  ctx.fillRect(0, 0, 20, logicalHeight);
  ctx.restore();

  if (customCoverImg) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(82, bandTop + 54, logicalWidth - 164, logicalHeight - bandTop - 164, 14);
    ctx.clip();
    drawFittedImage(
      ctx,
      customCoverImg,
      82,
      bandTop + 54,
      logicalWidth - 164,
      logicalHeight - bandTop - 164,
    );
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = bandInk;
    ctx.globalAlpha = 0.85;
    ctx.font = `520 32px ${serif}`;
    ctx.fillText(book.yearLabel || "", 82, bandTop + 74);
    ctx.restore();
  }

  drawCoverTypography(ctx, book, logicalWidth, logicalHeight, false, false, bandInk);
  return canvas;
}

export function createTitleDecal(book: DiaryBook) {
  const logicalWidth = 1024;
  const logicalHeight = 1536;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(0.5, 0.5);
  drawCoverTypography(ctx, book, logicalWidth, logicalHeight, true);
  return canvas;
}

export function createSpineCover(book: DiaryBook) {
  const isThin = (book.thickness ?? 0.24) <= 0.165;
  const logicalWidth = 256;
  const logicalHeight = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(0.5, 0.5);

  const spineStyle = book.spineStyle || "classic";
  const secondary = book.secondary || book.ink;

  ctx.fillStyle = book.cover;
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);
  addPaperGrain(ctx, logicalWidth, logicalHeight, `${book.id}-spine`);

  if (spineStyle === "banded") {
    ctx.save();
    ctx.fillStyle = book.accent;
    ctx.globalAlpha = 0.94;
    ctx.fillRect(0, 136, logicalWidth, 38);
    ctx.fillRect(0, logicalHeight - 196, logicalWidth, 38);
    ctx.fillStyle = secondary;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(0, 186, logicalWidth, 10);
    ctx.fillRect(0, logicalHeight - 218, logicalWidth, 10);
    ctx.restore();
  } else if (spineStyle === "bordered") {
    ctx.save();
    ctx.strokeStyle = book.accent;
    ctx.globalAlpha = 0.92;
    ctx.lineWidth = isThin ? 6 : 8;
    ctx.strokeRect(26, 78, logicalWidth - 52, logicalHeight - 156);
    ctx.fillStyle = secondary;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(48, 102, logicalWidth - 96, 8);
    ctx.fillRect(48, logicalHeight - 110, logicalWidth - 96, 8);
    ctx.restore();
  } else if (spineStyle === "classic") {
    ctx.save();
    ctx.fillStyle = book.accent;
    ctx.globalAlpha = 0.94;
    ctx.fillRect(14, 28, isThin ? 22 : 18, logicalHeight - 56);
    ctx.fillStyle = secondary;
    ctx.globalAlpha = 0.78;
    ctx.fillRect(42, 64, 5, logicalHeight - 128);
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = book.accent;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(logicalWidth * 0.5 - 42, 132, 84, 14);
    ctx.fillRect(logicalWidth * 0.5 - 42, logicalHeight - 178, 84, 14);
    ctx.fillStyle = secondary;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(logicalWidth * 0.5 - 24, 158, 48, 5);
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = book.ink;
  const hasSubLabel = !isThin && Boolean(book.yearLabel || book.subtitle);
  const titleOffset = isThin ? 0 : hasSubLabel ? -18 : 0;
  const titleStartY =
    spineStyle === "banded" ? logicalHeight - 280 : logicalHeight - 160;
  const maxTitleLength =
    spineStyle === "banded" ? 1360 : 1480;
  ctx.translate(logicalWidth / 2 + titleOffset, titleStartY);
  ctx.rotate(-Math.PI / 2);
  const baseSize = isThin ? 94 : 78;
  const size =
    book.shortTitle.length > 22 ? Math.round(baseSize * 0.82) : baseSize;
  ctx.font = `560 ${size}px ${serif}`;
  ctx.textBaseline = "middle";
  ctx.fillText(book.shortTitle, 0, 0, maxTitleLength);
  if (hasSubLabel) {
    ctx.font = `520 31px ${sans}`;
    ctx.globalAlpha = 0.82;
    ctx.fillText(book.yearLabel || book.subtitle, 0, 58, Math.min(1300, maxTitleLength));
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = book.ink;
  ctx.font = `700 ${isThin ? 34 : 26}px ${sans}`;
  ctx.textAlign = "center";
  const spineMark =
    book.spineMark !== undefined ? book.spineMark : siteConfig.spineMark;
  if (spineMark) {
    ctx.fillText(spineMark, logicalWidth / 2, logicalHeight - 54);
  }
  ctx.restore();
  return canvas;
}

export function createBackCover(book: DiaryBook) {
  const logicalWidth = 1024;
  const logicalHeight = 1536;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(0.5, 0.5);

  ctx.fillStyle = book.cover;
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);
  addPaperGrain(ctx, logicalWidth, logicalHeight, `${book.id}-back`);

  ctx.fillStyle = book.ink;
  ctx.font = `500 45px ${serif}`;
  ctx.textBaseline = "top";
  const lines = book.description.trim()
    ? wrapText(ctx, book.description, 108, 180, 808, 58, 12)
    : 0;

  if (book.quote.trim() || book.quoteBy.trim()) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = book.accent;
    ctx.fillRect(108, 180 + lines * 58 + 78, 108, 9);
    ctx.restore();

    if (book.quote.trim()) {
      ctx.font = `italic 500 54px ${serif}`;
      wrapText(
        ctx,
        `“${book.quote}”`,
        108,
        180 + lines * 58 + 132,
        808,
        63,
        6,
      );
    }
    if (book.quoteBy.trim()) {
      ctx.font = `600 24px ${sans}`;
      ctx.letterSpacing = "2px";
      ctx.fillText(book.quoteBy.toUpperCase(), 110, 1160);
    }
  }

  const imprint =
    book.coverImprint !== undefined ? book.coverImprint : siteConfig.coverImprint;
  const backFooter =
    book.coverFooter !== undefined && book.coverFooter.trim()
      ? book.coverFooter.trim()
      : [imprint, siteConfig.coverTagline].filter(Boolean).join(" · ");

  if (backFooter) {
    ctx.globalAlpha = 0.78;
    ctx.font = `500 20px ${sans}`;
    ctx.letterSpacing = "3px";
    ctx.fillText(backFooter, 110, 1380);
  }
  ctx.restore();
  return canvas;
}
