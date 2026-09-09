import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { hasSeenTutorial } from "../src/lib/tutorial";

export default function Index() {
  const [checked, setChecked] = useState(false);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    hasSeenTutorial().then((v) => {
      setSeen(v);
      setChecked(true);
    });
  }, []);

  if (!checked) return null;

  return <Redirect href={seen ? "/(budget)" : "/(tutorial)"} />;
}
