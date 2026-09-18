import type { ContainerKind } from './core';

export type Point = { x: number; y: number };

export const containerSize: Record<ContainerKind, { width: number; height: number }> = {
  cup: { width: 124, height: 138 },
  tall: { width: 82, height: 182 },
  bowl: { width: 176, height: 102 },
  bottle: { width: 68, height: 192 },
  triangle: { width: 174, height: 154 },
};

const normalizedShapes: Record<ContainerKind, Point[]> = {
  cup: [
    { x: -0.48, y: -0.5 }, { x: -0.45, y: 0.31 }, { x: -0.4, y: 0.4 },
    { x: -0.31, y: 0.47 }, { x: -0.18, y: 0.5 }, { x: 0.18, y: 0.5 },
    { x: 0.31, y: 0.47 }, { x: 0.4, y: 0.4 }, { x: 0.45, y: 0.31 },
    { x: 0.48, y: -0.5 },
  ],
  tall: [
    { x: -0.37, y: -0.5 }, { x: -0.35, y: 0.39 }, { x: -0.29, y: 0.46 },
    { x: -0.18, y: 0.5 }, { x: 0.18, y: 0.5 }, { x: 0.29, y: 0.46 },
    { x: 0.35, y: 0.39 }, { x: 0.37, y: -0.5 },
  ],
  bowl: [
    { x: -0.5, y: -0.42 }, { x: -0.49, y: -0.18 }, { x: -0.43, y: 0.08 },
    { x: -0.33, y: 0.3 }, { x: -0.2, y: 0.44 }, { x: 0, y: 0.5 },
    { x: 0.2, y: 0.44 }, { x: 0.33, y: 0.3 }, { x: 0.43, y: 0.08 },
    { x: 0.49, y: -0.18 }, { x: 0.5, y: -0.42 },
  ],
  bottle: [
    { x: -0.28, y: -0.5 }, { x: -0.28, y: 0.34 }, { x: -0.24, y: 0.42 },
    { x: -0.16, y: 0.48 }, { x: 0, y: 0.5 }, { x: 0.16, y: 0.48 },
    { x: 0.24, y: 0.42 }, { x: 0.28, y: 0.34 }, { x: 0.28, y: -0.5 },
  ],
  triangle: [
    { x: -0.17, y: -0.5 }, { x: -0.2, y: -0.28 }, { x: -0.49, y: 0.38 },
    { x: -0.43, y: 0.47 }, { x: -0.31, y: 0.5 }, { x: 0.31, y: 0.5 },
    { x: 0.43, y: 0.47 }, { x: 0.49, y: 0.38 }, { x: 0.2, y: -0.28 },
    { x: 0.17, y: -0.5 },
  ],
};

export function makeContainerPoints(kind: ContainerKind, centerX: number, centerY: number, scale = 1): Point[] {
  const size = containerSize[kind];
  return normalizedShapes[kind].map((point) => ({
    x: centerX + point.x * size.width * scale,
    y: centerY + point.y * size.height * scale,
  }));
}

export function rotatePoints(points: Point[], center: Point, radians: number): Point[] {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return points.map((point) => {
    const x = point.x - center.x;
    const y = point.y - center.y;
    return { x: center.x + x * cosine - y * sine, y: center.y + x * sine + y * cosine };
  });
}

export function polygonArea(points: Point[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }
  return Math.abs(area) / 2;
}

export function boundsOf(points: Point[]) {
  return points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x), maxX: Math.max(bounds.maxX, point.x),
    minY: Math.min(bounds.minY, point.y), maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

function intersectAtY(start: Point, end: Point, y: number): Point {
  const distance = end.y - start.y;
  const ratio = Math.abs(distance) < 0.00001 ? 0 : (y - start.y) / distance;
  return { x: start.x + (end.x - start.x) * ratio, y };
}

export function clipBelow(points: Point[], surfaceY: number): Point[] {
  const result: Point[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const currentInside = current.y >= surfaceY;
    const nextInside = next.y >= surfaceY;
    if (currentInside) result.push(current);
    if (currentInside !== nextInside) result.push(intersectAtY(current, next, surfaceY));
  }
  return result;
}

export function surfaceForFraction(points: Point[], fraction: number): number {
  const clamped = Math.max(0, Math.min(1, fraction));
  const bounds = boundsOf(points);
  if (clamped <= 0) return bounds.maxY;
  if (clamped >= 1) return bounds.minY;
  const totalArea = polygonArea(points);
  let low = bounds.minY;
  let high = bounds.maxY;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const middle = (low + high) / 2;
    const filled = polygonArea(clipBelow(points, middle)) / totalArea;
    if (filled > clamped) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function horizontalSpan(points: Point[], y: number): { left: number; right: number } | null {
  const intersections: number[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if ((start.y <= y && end.y > y) || (end.y <= y && start.y > y)) intersections.push(intersectAtY(start, end, y).x);
  }
  if (intersections.length < 2) return null;
  intersections.sort((a, b) => a - b);
  return { left: intersections[0], right: intersections[intersections.length - 1] };
}

export function smoothstep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}
