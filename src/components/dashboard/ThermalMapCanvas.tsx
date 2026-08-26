'use client';

import { motion } from 'framer-motion';

interface ThermalMapCanvasProps {
  locationName: string;
  baseTimestamp?: string;
  thermalCellCount?: number;
  resolution?: number;
  loading: boolean;
  children: React.ReactNode;
}

/**
 * FortyGuard Thermal Field — the visual HERO of the dashboard.
 *
 * Visual hierarchy: this is the HIGHEST priority. The actual returned
 * FortyGuard polygons are the visual hero; this wrapper surfaces the
 * analysis boundary, thermal-cell count, resolution, and legend alongside
 * the map. The map itself (MapLibre) is passed in as children so the dynamic
 * ssr:false import stays in the page orchestrator.
 */
export function ThermalMapCanvas({
  locationName,
  baseTimestamp,
  thermalCellCount,
  resolution,
  loading,
  children,
}: ThermalMapCanvasProps) {
  return (
    <motion.section
      className="rounded-xl border border-border bg-surface-card overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      aria-label="FortyGuard thermal field"
    >
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-text-primary">FortyGuard Thermal Field</h2>
          <p className="text-xs text-text-muted mt-0.5">
            Hyperlocal spatial temperature distribution
            {baseTimestamp && (
              <span className="font-mono ml-1.5" style={{ color: 'var(--accent-cyan)', opacity: 0.85 }}>
                · {new Date(baseTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {typeof thermalCellCount === 'number' && thermalCellCount > 0 && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono border border-border bg-surface-elevated text-text-muted">
              {thermalCellCount} thermal cells
            </span>
          )}
          {typeof resolution === 'number' && (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono border border-border bg-surface-elevated text-text-muted">
              {resolution}m res
            </span>
          )}
          <span className="text-xs text-text-dimmed font-mono hidden sm:block">
            {locationName.split(' (')[0]}
          </span>
        </div>
      </div>

      <div className="px-4 pb-4 relative">
        {children}
        {/* Thermal field loading overlay */}
        {loading && (
          <div className="absolute inset-4 rounded-xl bg-surface-card/70 backdrop-blur-sm flex items-center justify-center pointer-events-none scan-loading">
            <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
              <span className="w-4 h-4 border-2 border-border border-t-accent-cyan rounded-full animate-spin" style={{ borderTopColor: 'var(--accent-cyan)' }} />
              Generating thermal field…
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}

export default ThermalMapCanvas;
