import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { hasSeenTutorial } from "../src/lib/tutorial";
import { getHubRoute } from "../src/hub/registry";
import { useModulePreferences } from "../src/hub/ModulePreferences";

export default function Index() {
  const { enabledIds } = useModulePreferences();
  const [checked, setChecked] = useState(false);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    hasSeenTutorial()
      .then((v) => {
        setSeen(v);
        setChecked(true);
      })
      .catch(() => {
        // Keychain read failed — default `seen` stays true (go to budget)
        // instead of blocking the app on a permanent null render.
        setChecked(true);
      });
  }, []);

  if (!checked) return null;

  return <Redirect href={seen ? getHubRoute(enabledIds[0]) : "/(tutorial)"} />;
}
