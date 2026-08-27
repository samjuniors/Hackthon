'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface MobileAnalysisSheetProps {
  /** Always-rendered summary line in the peek bar (state or result summary). */
  summary: React.ReactNode;
  /** Compact primary action in the peek bar (Generate). */
  action?: React.ReactNode;
  /** Full sheet body — analysis sections + results. */
  children: React.ReactNode;
  /** Controlled open state (header menu button opens the sheet). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * MobileAnalysisSheet — the mobile analysis + result panel.
 *
 * A lightweight bottom sheet with two snap states:
 *   peek  (~64px) — handle + one-line summary + primary action
 *   full  (82vh)   — scrollable analysis sections and results
 *
 * Drag the handle (pointer events) or tap it to toggle. The sheet is
 * safe-area aware (padding-bottom: env(safe-area-inset-bottom)) and respects
 * prefers-reduced-motion (transition disabled globally in globals.css).
 * Desktop never renders it (the page wraps it in a `lg:hidden` container).
 */
export function MobileAnalysisSheet({
  summary,
  action,
  children,
  open,
  onOpenChange,
}: MobileAnalysisSheetProps) {
  const FULL_VH = 82;
  const PEEK_PX = 64;

  const [dragging, setDragging] = useState(false);
  const [dragY, setDragY] = useState<number | null>(null);
  const dragStartYRef = useRef(0);
  const dragStartOpenRef = useRef(false);

  // Close on Escape when open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragStartYRef.current = e.clientY;
      dragStartOpenRef.current = open;
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [open],
  );

  const onHandlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragY(e.clientY - dragStartYRef.current);
  }, [dragging]);

  const onHandlePointerUp = useCallback(() => {
    if (!dragging) return;
    const delta = dragY ?? 0;
    setDragging(false);
    setDragY(null);
    // Intent: dragged up past ~40px → open; down past ~40px → close; else toggle.
    if (delta < -40) onOpenChange(true);
    else if (delta > 40) onOpenChange(false);
    else onOpenChange(!dragStartOpenRef.current);
  }, [dragging, dragY, onOpenChange]);

  // While open the sheet occupies FULL_VH of the viewport; dragging
  // translates it live. When closed, the peek bar is always visible.
  const translateY = (() => {
    if (open && dragY !== null) {
      // Dragging down from full reduces height visually; clamp ≥ 0.
      return Math.max(0, dragY);
    }
    return undefined; // CSS-driven (transform via data-open)
  })();

  return (
    <div
      className="sheet-panel lg:hidden"
      data-open={open ? 'true' : 'false'}
      data-dragging={dragging ? 'true' : 'false'}
      style={{
        height: open ? `${FULL_VH}vh` : undefined,
        transform: open
          ? translateY !== undefined
            ? `translateY(${translateY}px)`
            : 'translateY(0)'
          : 'translateY(0)',
      }}
      role="dialog"
      aria-label="Analysis panel"
      aria-modal={open ? 'true' : 'false'}
    >
      {/* Drag handle + peek bar */}
      <div
        className="cursor-grab active:cursor-grabbing select-none"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        onClick={() => {
          if (dragY === null) onOpenChange(!open);
        }}
        role="button"
        tabIndex={0}
        aria-label={open ? 'Collapse analysis panel' : 'Expand analysis panel'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onOpenChange(!open);
        }}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="flex items-center gap-3 px-4 pb-2.5 min-h-[44px]">
          <ChevronDown
            className={`size-4 text-text-dimmed shrink-0 transition-transform duration-200 ${open ? '' : 'rotate-180'}`}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0 text-[12px] text-text-secondary truncate">{summary}</div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </div>

      {/* Scrollable body — only interactive when open */}
      <div
        className={`overflow-y-auto overscroll-contain px-4 pb-6 ${open ? '' : 'pointer-events-none'}`}
        style={{ maxHeight: open ? `calc(${FULL_VH}vh - 72px)` : 0, opacity: open ? 1 : 0 }}
        aria-hidden={!open}
      >
        {children}
      </div>
    </div>
  );
}

export default MobileAnalysisSheet;
