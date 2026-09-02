import * as Application from "expo-application";

export const getAppVersion = (): string => {
  try {
    return Application.nativeApplicationVersion ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
};

export const DB_NAME = "app_data";
export const DB_VERSION = 1;
