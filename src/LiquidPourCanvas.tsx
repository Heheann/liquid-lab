import { useEffect, useRef } from 'react';
import type { ContainerKind, Settings } from './core';
import { boundsOf, containerSize, horizontalSpan, makeContainerPoints, polygonArea, rotatePoints, smoothstep, surfaceForFraction, type Point } from './liquidPhysics';

type PourPhase = 'ready' | 'pouring' | 'complete';
type Particle = { x: number; y: number; vx: number; vy: number; radius: number; mass: number; alpha: number; delay: number };

const WIDTH = 760;
const HEIGHT = 350;
const GRAVITY = 520;
const SOURCE_FILL = 0.62;

const liquidColors: Record<string, { body: string; light: string }> = {
  water: { body: '#43c7e2', light: '#a8f3f5' },
  milk: { body: '#eaf3ec', light: '#ffffff' },
  oil: { body: '#d9b83f', light: '#fff0a3' },
  juice: { body: '#ea7c49', light: '#ffc39e' },
  soup: { body: '#c95f38', light: '#f6ad7f' },
  soy: { body: '#71414a', light: '#c3898e' },
};

export function pourDuration(speed: Settings['speed']): number {
  return speed === 'slow' ? 4200 : speed === 'fast' ? 2700 : 3500;
}

function polygonPath(context: CanvasRenderingContext2D, points: Point[], close = true) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  if (close) context.closePath();
}

function drawLiquid(context: CanvasRenderingContext2D, points: Point[], fraction: number, colors: { body: string; light: string }, ripple: number, time: number) {
  if (fraction <= 0.001) return;
  const surfaceY = surfaceForFraction(points, fraction);
  const bounds = boundsOf(points);
  const amplitude = Math.min(5, ripple * 4.2);
  const gradient = context.createLinearGradient(0, surfaceY, 0, bounds.maxY);
  gradient.addColorStop(0, colors.light);
  gradient.addColorStop(0.1, colors.body);
  gradient.addColorStop(1, `${colors.body}dd`);

  context.save();
  polygonPath(context, points);
  context.clip();
  context.beginPath();
  context.moveTo(bounds.minX - 8, bounds.maxY + 8);
  context.lineTo(bounds.minX - 8, surfaceY);
  for (let x = bounds.minX - 8; x <= bounds.maxX + 8; x += 4) {
    const wave = amplitude * Math.sin((x - bounds.minX) * 0.105 + time * 0.012) * Math.exp(-Math.abs(x - (bounds.minX + bounds.maxX) / 2) / Math.max(28, bounds.maxX - bounds.minX));
    context.lineTo(x, surfaceY + wave);
  }
  context.lineTo(bounds.maxX + 8, bounds.maxY + 8);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();

  context.beginPath();
  for (let x = bounds.minX - 8; x <= bounds.maxX + 8; x += 4) {
    const wave = amplitude * Math.sin((x - bounds.minX) * 0.105 + time * 0.012) * Math.exp(-Math.abs(x - (bounds.minX + bounds.maxX) / 2) / Math.max(28, bounds.maxX - bounds.minX));
    if (x === bounds.minX - 8) context.moveTo(x, surfaceY + wave);
    else context.lineTo(x, surfaceY + wave);
  }
  context.strokeStyle = colors.light;
  context.globalAlpha = 0.72;
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

function drawContainer(context: CanvasRenderingContext2D, points: Point[], kind: ContainerKind, fraction: number, colors: { body: string; light: string }, ripple: number, time: number) {
  context.save();
  polygonPath(context, points);
  context.fillStyle = 'rgba(130, 223, 230, 0.055)';
  context.fill();
  drawLiquid(context, points, fraction, colors, ripple, time);

  polygonPath(context, points, false);
  context.strokeStyle = '#9be7e8';
  context.lineWidth = kind === 'bottle' ? 4 : 4.5;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.stroke();

  const mouthLeft = points[0];
  const mouthRight = points[points.length - 1];
  context.beginPath();
  context.moveTo(mouthLeft.x, mouthLeft.y);
  context.lineTo(mouthRight.x, mouthRight.y);
  context.strokeStyle = '#c7fbfa';
  context.lineWidth = 3;
  context.stroke();

  if (points.length > 3) {
    context.beginPath();
    context.moveTo(points[1].x, points[1].y);
    context.lineTo(points[2].x, points[2].y);
    context.strokeStyle = 'rgba(255,255,255,.42)';
    context.lineWidth = 2;
    context.stroke();
  }
  context.restore();
}

function drawParticle(context: CanvasRenderingContext2D, particle: Particle, colors: { body: string; light: string }) {
  const speed = Math.hypot(particle.vx, particle.vy);
  const trail = Math.min(15, speed * 0.026);
  context.save();
  context.globalAlpha = particle.alpha;
  context.strokeStyle = colors.body;
  context.lineWidth = particle.radius * 1.7;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(particle.x - particle.vx / Math.max(speed, 1) * trail, particle.y - particle.vy / Math.max(speed, 1) * trail);
  context.lineTo(particle.x, particle.y);
  context.stroke();
  context.fillStyle = colors.light;
  context.beginPath();
  context.arc(particle.x - particle.radius * 0.2, particle.y - particle.radius * 0.25, Math.max(0.8, particle.radius * 0.34), 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawLabel(context: CanvasRenderingContext2D, text: string, x: number, y: number) {
  context.fillStyle = '#a8c9cf';
  context.font = '700 15px "Microsoft JhengHei", sans-serif';
  context.textAlign = 'center';
  context.fillText(text, x, y);
}

export function LiquidPourCanvas({ source, target, liquid, phase, speed }: { source: ContainerKind; target: ContainerKind; liquid: string; phase: PourPhase; speed: Settings['speed'] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const colors = liquidColors[liquid] ?? liquidColors.water;
    const duration = pourDuration(speed);
    const particles: Particle[] = [];
    const sourceArea = polygonArea(makeContainerPoints(source, 0, 0));
    const targetArea = polygonArea(makeContainerPoints(target, 0, 0));
    const targetFullFraction = Math.min(0.86, sourceArea * SOURCE_FILL / targetArea);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let animationFrame = 0;
    let startTime = performance.now();
    let previousTime = startTime;
    let emitted = 0;
    let arrived = 0;
    let ripple = 0;
    context.setTransform(2, 0, 0, 2, 0, 0);

    const render = (now: number) => {
      const elapsed = now - startTime;
      const delta = Math.min(0.55, Math.max(0, (now - previousTime) / 1000));
      previousTime = now;
      const rawProgress = phase === 'pouring' ? Math.min(1, elapsed / duration) : phase === 'complete' ? 1 : 0;
      const progress = prefersReducedMotion && phase === 'pouring' ? 1 : rawProgress;
      const tiltIn = phase === 'pouring' ? smoothstep(progress / 0.2) : phase === 'complete' ? 0 : 0;
      const tiltOut = phase === 'pouring' ? 1 - smoothstep((progress - 0.72) / 0.2) : 0;
      const tilt = phase === 'pouring' ? Math.min(tiltIn, tiltOut) : 0;
      const angle = tilt * 1.03;
      const sourceCenter = { x: 202 + tilt * 24, y: 140 - tilt * 22 };
      const sourcePoints = rotatePoints(makeContainerPoints(source, sourceCenter.x, sourceCenter.y), sourceCenter, angle);
      const targetHeight = containerSize[target].height;
      const targetCenter = { x: 555, y: 318 - targetHeight / 2 };
      const targetPoints = makeContainerPoints(target, targetCenter.x, targetCenter.y);
      const targetBounds = boundsOf(targetPoints);
      const desiredEmission = phase === 'complete' ? 1 : phase === 'pouring' ? smoothstep((progress - 0.2) / 0.42) : 0;
      const sourceSurface = surfaceForFraction(sourcePoints, SOURCE_FILL * Math.max(0, 1 - emitted));
      const spout = sourcePoints[sourcePoints.length - 1];
      const canPour = angle > 0.56 && sourceSurface <= spout.y + 10;

      if (phase === 'pouring' && canPour) {
        while (emitted + 0.0075 <= desiredEmission && particles.length < 180) {
          const mass = Math.min(0.0085, 1 - emitted);
          const edgeDrop = Math.random() < 0.16;
          const flight = Math.sqrt(Math.max(0.24, 2 * Math.max(50, targetBounds.maxY - spout.y) / GRAVITY));
          particles.push({
            x: spout.x + (Math.random() - 0.5) * 7,
            y: spout.y + Math.random() * 4,
            vx: (targetCenter.x - spout.x) / flight + (Math.random() - 0.5) * (edgeDrop ? 48 : 24),
            vy: -8 + Math.random() * 26,
            radius: edgeDrop ? 1.7 + Math.random() * 1.7 : 2.8 + Math.random() * 2.5,
            mass,
            alpha: 0.72 + Math.random() * 0.25,
            delay: Math.random() * Math.min(0.48, delta),
          });
          emitted += mass;
        }
      }

      let remaining = delta;
      while (remaining > 0.0001) {
        const step = Math.min(1 / 60, remaining);
        const targetFraction = targetFullFraction * Math.min(1, arrived);
        const targetSurface = surfaceForFraction(targetPoints, targetFraction);
        for (let index = particles.length - 1; index >= 0; index -= 1) {
          const particle = particles[index];
          if (particle.delay > 0) { particle.delay -= step; continue; }
          particle.vx += (targetCenter.x - particle.x) * 0.45 * step;
          particle.vy += GRAVITY * step;
          particle.x += particle.vx * step;
          particle.y += particle.vy * step;
          const span = horizontalSpan(targetPoints, Math.min(targetBounds.maxY - 1, Math.max(targetBounds.minY + 1, particle.y)));
          const reachedLiquid = particle.y >= targetSurface - particle.radius;
          const inside = span && particle.x >= span.left - 4 && particle.x <= span.right + 4 && particle.y >= targetBounds.minY;
          if (reachedLiquid && inside) {
            arrived = Math.min(1, arrived + particle.mass);
            ripple = Math.min(1.15, ripple + particle.mass * 9 + Math.abs(particle.vy) / 2400);
            particles.splice(index, 1);
          } else if (particle.y > HEIGHT + 30 || particle.x > WIDTH + 30 || particle.x < -30) {
            particles.splice(index, 1);
          }
        }
        ripple *= Math.pow(0.032, step);
        remaining -= step;
      }

      if (phase === 'complete') {
        emitted = 1;
        arrived = 1;
        ripple = 0;
      }

      canvas.dataset.progress = progress.toFixed(3);
      canvas.dataset.emitted = emitted.toFixed(3);
      canvas.dataset.arrived = arrived.toFixed(3);
      canvas.dataset.particles = String(particles.length);
      canvas.dataset.canPour = String(canPour);

      context.clearRect(0, 0, WIDTH, HEIGHT);
      const backdrop = context.createLinearGradient(0, 0, 0, HEIGHT);
      backdrop.addColorStop(0, '#12394b');
      backdrop.addColorStop(1, '#081f2d');
      context.fillStyle = backdrop;
      context.fillRect(0, 0, WIDTH, HEIGHT);
      context.strokeStyle = 'rgba(112, 184, 195, .22)';
      context.lineWidth = 1;
      for (let y = 68; y < HEIGHT; y += 54) {
        context.beginPath();
        context.moveTo(26, y);
        context.lineTo(WIDTH - 26, y);
        context.stroke();
      }
      context.fillStyle = 'rgba(126, 211, 218, .08)';
      context.beginPath();
      context.ellipse(targetCenter.x, 326, 126, 12, 0, 0, Math.PI * 2);
      context.fill();

      const shownSourceFraction = phase === 'complete' ? 0 : SOURCE_FILL * Math.max(0, 1 - emitted);
      const shownTargetFraction = phase === 'complete' ? targetFullFraction : targetFullFraction * Math.min(1, arrived);
      drawContainer(context, sourcePoints, source, shownSourceFraction, colors, 0.05, now);
      particles.forEach((particle) => drawParticle(context, particle, colors));
      drawContainer(context, targetPoints, target, shownTargetFraction, colors, ripple, now);
      drawLabel(context, phase === 'complete' ? '原容器（已倒空）' : '原容器', sourceCenter.x, 332);
      drawLabel(context, '接收容器', targetCenter.x, 342);

      if (phase === 'pouring' && progress < 1 && !prefersReducedMotion) animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [liquid, phase, source, speed, target]);

  return <canvas ref={canvasRef} width={WIDTH * 2} height={HEIGHT * 2} className="pour-canvas" role="img" data-phase={phase} data-source={source} data-target={target} aria-label={`液體從${source}容器受到重力流入${target}容器的動畫`} />;
}
