import { useEffect, useState } from 'react';
import { checkForcedUpdate } from './remoteConfig';

interface UpdateGateState {
  isChecking: boolean;
  updateRequired: boolean;
}

// Runs once per app launch (RootNavigator holds the only instance) -
// deliberately not re-checked on every foreground/focus, so a person
// already past the gate this session is never yanked back out of the
// app mid-use over a version check.
export function useUpdateGate(): UpdateGateState {
  const [isChecking, setIsChecking] = useState(true);
  const [updateRequired, setUpdateRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkForcedUpdate()
      .then((required) => {
        if (!cancelled) setUpdateRequired(required);
      })
      .finally(() => {
        if (!cancelled) setIsChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { isChecking, updateRequired };
}
