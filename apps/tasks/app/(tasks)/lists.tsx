import { Redirect } from "expo-router";
// Old bookmarks open the combined task view after list management was removed.
export default function LegacyListsScreen() { return <Redirect href={{ pathname: "/(tasks)", params: { compose: "" } }} />; }
