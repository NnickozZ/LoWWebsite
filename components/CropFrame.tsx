'use client';

import { useRef, useState } from 'react';
import { assetUrl, coverClass, cropStyle } from '@/components/Cover';
import { CENTRED, MAX_ZOOM, MIN_ZOOM, SHAPES, type Crop, type CropShape } from '@/lib/images/shapes';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

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
    onCommit(local);
  }

  function onWheel(event: React.WheelEvent) {
    const next = clamp(local.zoom * (event.deltaY < 0 ? 1.08 : 0.93), MIN_ZOOM, MAX_ZOOM);
    const crop = { ...local, zoom: Number(next.toFixed(3)) };
    setLocal(crop);
    onCommit(crop);
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
    onCommit(local);
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
      onWheel={onWheel}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetUrl(assetId, 'full')} alt="" style={cropStyle(local)} draggable={false} />
    </div>
  );
}
