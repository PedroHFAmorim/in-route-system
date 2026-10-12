import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

// Compass heading in degrees (null until first reading). Subscription removed on unmount.
export function useHeading(): number | null {
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let dead = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const s = await Location.watchHeadingAsync((x) => setH(x.trueHeading >= 0 ? x.trueHeading : x.magHeading));
        if (dead) s.remove();
        else sub = s;
      } catch {}
    })();
    return () => {
      dead = true;
      sub?.remove();
    };
  }, []);
  return h;
}
