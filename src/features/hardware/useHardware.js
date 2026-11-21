import { useEffect, useState } from 'react';
import { getKernel } from '../terminal/kernelBridge';

/** Snapshot del hardware del robot que se actualiza con cada ciclo del bus. */
export function useHardware() {
  const { hardware } = getKernel();
  const [snap, setSnap] = useState(() => hardware.snapshot());
  useEffect(() => hardware.subscribe(() => setSnap(hardware.snapshot())), [hardware]);
  return { hardware, snap };
}
