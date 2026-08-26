# Task 2-a — settings-and-header-builder

## Files created (4)
1. `/home/z/my-project/src/lib/user-preferences.ts`
2. `/home/z/my-project/src/components/dashboard/Header.tsx`
3. `/home/z/my-project/src/components/dashboard/SystemStatus.tsx`
4. `/home/z/my-project/src/components/SettingsDrawer.tsx`

## Exports
- `user-preferences.ts`: `AnalysisResolution`, `AnalysisAreaShape`, `MapLayerVisibility`, `UserPreferences`, `DEFAULT_USER_PREFERENCES`, `PREFS_KEY`, `loadUserPreferences`, `saveUserPreferences`, `UserPreferencesSetters`, `useUserPreferences`.
- `Header.tsx`: named `Header`, default `Header`. Inline `StatusDot`.
- `SystemStatus.tsx`: named `SystemStatus`, default `SystemStatus`.
- `SettingsDrawer.tsx`: named `SettingsDrawer`, default `SettingsDrawer`.

## useUserPreferences() return shape
```ts
[UserPreferences, {
  setDataSourceMode: (m: 'LIVE' | 'FIXTURE') => void;
  setPreferredAIProvider: (p: PreferredAIProvider) => void;
  setAnalysisResolution: (r: AnalysisResolution) => void;
  setAnalysisAreaShape: (s: AnalysisAreaShape) => void;
  setMapLayerVisibility: (v: Partial<MapLayerVisibility>) => void;
  reset: () => void;
}]
```
Snapshot-stable: caches parsed object by raw localStorage string so `useSyncExternalStore` does not loop.

## Lint
`bun run lint` → 0 errors, 0 warnings. Clean.
