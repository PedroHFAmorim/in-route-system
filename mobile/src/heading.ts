import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

// Compass heading in degrees + availability.
// available: null = still probing, true = compass present, false = no magnetometer (device lacks it) or permission denied.
export function useHeading(): { heading: number | null; available: boolean | null } {
  const [h, setH] = useState<number | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let dead = false;
    // ponytail: no reading in 2.5s = no compass. A real magnetometer reports within ms;
    // raise this if a slow device ever gets a false "no compass".
    const t = setTimeout(() => { if (!dead) setAvailable((a) => (a === null ? false : a)); }, 2500);
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') { if (!dead) setAvailable(false); return; }
        const s = await Location.watchHeadingAsync((x) => {
          if (dead) return;
          setH(x.trueHeading >= 0 ? x.trueHeading : x.magHeading);
          setAvailable(true);
        });
        if (dead) s.remove();
        else sub = s;
      } catch {
        if (!dead) setAvailable(false);
      }
    })();
    return () => {
      dead = true;
      clearTimeout(t);
      sub?.remove();
    };
  }, []);
  return { heading: h, available };
}
