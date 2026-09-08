'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { assetUrl, coverClass, cropStyle } from '@/components/Cover';
import { CENTRED, MAX_ZOOM, MIN_ZOOM, SHAPES, type Crop, type CropShape } from '@/lib/images/shapes';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** §52: how long the wheel must be still before the crop is saved. */
const COMMIT_WAIT = 300;

/**
 * One frame you drag a picture around inside, for one *shape* (round 19):
 * its aspect is `SHAPES[shape]`, never the caller's, so the crop being set is
 * exactly the crop every list of that shape will draw. Nothing is written to
 * the file — only a focal point and a zoom.
 */
export function CropFrame({
  assetId,
  crop,
  shape,
  className = 'crop-frame',
  onCommit,
}: {
  assetId: string;
  crop: Crop | null;
  shape: CropShape;
  className?: string;
  /** Called when the gesture ends, with the crop to save. */
  onCommit: (crop: Crop) => void;
}) {
  const [local, setLocal] = useState<Crop>(crop ?? CENTRED);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; from: Crop } | null>(
    null,
  );
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  /*
   * §52: the wheel, twice repaired.
   *
   * It was a React `onWheel`, and React attaches wheel listeners *passively*,
   * so `preventDefault` inside one is a silent no-op: every notch zoomed the
   * picture and scrolled the page out from under the frame at the same time.
   * A real listener with `{ passive: false }` is the only thing a browser
   * honours — the same shape `MapCanvas` has always used.
   *
   * And it saved on every notch. A wheel sends a dozen events for one gesture,
   * so setting a crop wrote a dozen times. The zoom stays live on the screen
   * (that is what a zoom is for) and the *saving* waits until the wheel has
   * been still for a moment. `localRef` carries the newest crop into the
   * timer without re-arming the listener on every frame, and a pending save is
   * flushed if the frame is taken away before it fires — a crop set and
   * immediately closed must not be the one that is lost.
   */
  const localRef = useRef<Crop>(local);
  localRef.current = local;
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitSoon = useCallback(() => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null;
      commitRef.current(localRef.current);
    }, COMMIT_WAIT);
  }, []);

  const commitNow = useCallback((crop: Crop) => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    commitRef.current(crop);
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = localRef.current;
      const next = clamp(current.zoom * (event.deltaY < 0 ? 1.08 : 0.93), MIN_ZOOM, MAX_ZOOM);
      setLocal({ ...current, zoom: Number(next.toFixed(3)) });
      commitSoon();
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [commitSoon]);

  useEffect(
    () => () => {
      if (!commitTimer.current) return;
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
      commitRef.current(localRef.current);
    },
    [],
  );

  function onPointerDown(event: React.PointerEvent) {
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      from: local,
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    const state = drag.current;
    const frame = frameRef.current;
    if (!state || !frame || state.pointerId !== event.pointerId) return;
    const rect = frame.getBoundingClientRect();
    // Dragging right moves the picture right, so the focal point moves left.
    const dx = (event.clientX - state.startX) / rect.width / state.from.zoom;
    const dy = (event.clientY - state.startY) / rect.height / state.from.zoom;
    setLocal({
      x: clamp(state.from.x - dx, 0, 1),
      y: clamp(state.from.y - dy, 0, 1),
      zoom: state.from.zoom,
    });
  }

  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    commitNow(local);
  }

  function onTouchMove(event: React.TouchEvent) {
    if (event.touches.length !== 2) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!pinch.current) {
      pinch.current = { distance, zoom: local.zoom };
      return;
    }
    // Read the ref before the updater: React may run it after the touch ended.
    const zoom = clamp((pinch.current.zoom * distance) / pinch.current.distance, MIN_ZOOM, MAX_ZOOM);
    setLocal((current) => ({ ...current, zoom }));
  }

  function onTouchEnd() {
    if (!pinch.current) return;
    pinch.current = null;
    commitNow(local);
  }

  return (
    <div
      className={`${className} ${coverClass(shape)}`}
      data-shape={shape}
      aria-label={`Uitsnede ${SHAPES[shape].label.toLowerCase()}`}
      ref={frameRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetUrl(assetId, 'full')} alt="" style={cropStyle(local)} draggable={false} />
    </div>
  );
}
